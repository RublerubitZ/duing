package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.FeeAccount;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeAccountRepository;
import com.duing.domain.fee.service.dto.command.SyncTransactionsCommand;
import com.duing.domain.fee.service.dto.query.SyncResult;
import com.duing.domain.fee.support.BankCodeMapper;
import com.duing.domain.fee.support.TransactionHasher;
import com.duing.global.bank.BankApiClient;
import com.duing.global.bank.dto.BankTransactionData;
import com.duing.global.bank.dto.TransactionLookupCommand;
import com.duing.global.crypto.FeeAccountCipher;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link BankTransactionSyncService} 기본 구현체.
 *
 * <p><b>인증정보 비저장 원칙</b>: {@link SyncTransactionsCommand} 의 {@code accountPassword}·
 * {@code residentNumber} 는 BANK API 거래 조회 호출에만 사용하고, DB·캐시·로그·이벤트·raw_payload
 * 어디에도 저장하거나 출력하지 않는다. 호출 직후 별도 참조 없이 메서드 스코프 종료로 폐기된다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankTransactionSyncService implements BankTransactionSyncService {

    /** 동기화 조회 기간 하한(오늘 기준 N 일 전). 최초 동기화·오래된 마지막 거래 모두 이 하한으로 제한한다. */
    private static final int LOOKBACK_DAYS = 14;

    private final ClubAuthService clubAuthService;
    private final BankMatchingAdminService bankMatchingAdminService;
    private final FeeAccountRepository feeAccountRepository;
    private final FeeAccountCipher feeAccountCipher;
    private final BankCodeMapper bankCodeMapper;
    private final BankApiClient bankApiClient;
    private final TransactionHasher transactionHasher;
    private final BankTransactionRepository bankTransactionRepository;
    private final Clock clock;

    @Override
    @Transactional
    public SyncResult sync(SyncTransactionsCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());      // 권한: 운영진(LEADER/OFFICER)
        bankMatchingAdminService.requireActiveUsable(command.clubId());           // 사용 가능(active && api_registered) 검증
        FeeAccount account = feeAccountRepository.findByClubId(command.clubId())
                .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
        String bankCode = bankCodeMapper.toApiCode(account.getBank());
        String accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), command.clubId());

        LocalDate today = LocalDate.now(clock);
        LocalDate startDate = resolveStartDate(command.clubId(), today);

        // 민감 인증정보(계좌 비번·주민번호 앞 6자리)는 오직 이 BANK API 호출에만 전달한다.
        // 이후 어떤 변수에도 보관하지 않으며, 적재·로깅·예외에 절대 싣지 않는다.
        List<BankTransactionData> fetchedTransactions = bankApiClient.getTransactions(
                new TransactionLookupCommand(
                        bankCode, accountNumber,
                        command.accountPassword(), command.residentNumber(),
                        startDate, today));

        List<String> insertedHashes = new ArrayList<>();
        for (BankTransactionData transaction : fetchedTransactions) {
            String transactionHash = transactionHasher.hash(command.clubId(), bankCode, transaction);
            boolean deposit = transaction.isDeposit();
            String transactionType = deposit ? "DEPOSIT" : "WITHDRAWAL";
            String matchStatus = deposit ? "PENDING" : "IGNORED";
            int inserted = bankTransactionRepository.insertIgnoringConflict(
                    command.clubId(), bankCode, transaction.transactionAt(),
                    transaction.amount(), transaction.balance(), transaction.counterparty(),
                    transactionType, matchStatus, null, transactionHash,
                    transaction.rawJson());   // raw_payload 는 BANK API 응답 거래만 — 인증정보는 절대 들어가지 않는다
            if (inserted == 1) {
                insertedHashes.add(transactionHash);
            }
        }

        int newDepositCount = countNewlyStoredDeposits(insertedHashes);
        // 매칭은 BE-5 에서 — 지금은 자동매칭 0, 신규 입금은 전부 검토 대기로 집계한다.
        return new SyncResult(fetchedTransactions.size(), insertedHashes.size(), 0, newDepositCount);
    }

    private int countNewlyStoredDeposits(List<String> insertedHashes) {
        if (insertedHashes.isEmpty()) {
            return 0;
        }
        return (int) bankTransactionRepository.findByTransactionHashIn(insertedHashes).stream()
                .filter(BankTransaction::isPending)
                .filter(BankTransaction::isDeposit)
                .count();
    }

    /**
     * 조회 시작일을 결정한다. 마지막 적재 거래가 있으면 그 하루 전부터(경계 거래 누락 방지),
     * 없으면 기간 하한부터 조회한다. 어떤 경우든 하한({@code today - LOOKBACK_DAYS}) 아래로 내려가지 않는다.
     */
    private LocalDate resolveStartDate(Long clubId, LocalDate today) {
        LocalDate lowerBound = today.minusDays(LOOKBACK_DAYS);
        LocalDateTime latest = bankTransactionRepository.findLatestTransactionAt(clubId).orElse(null);
        if (latest == null) {
            return lowerBound;
        }
        LocalDate fromLatest = latest.toLocalDate().minusDays(1);
        return fromLatest.isBefore(lowerBound) ? lowerBound : fromLatest;
    }
}
