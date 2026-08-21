package com.duing.domain.fee.service;

import com.duing.domain.cashbook.service.CashbookService;
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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link BankTransactionSyncService} 기본 구현체.
 *
 * <p><b>인증정보 비저장 원칙</b>: {@link SyncTransactionsCommand} 의 {@code accountPassword}·
 * {@code residentNumber} 는 BANK API 거래 조회 호출에만 사용하고, DB·캐시·로그·이벤트·raw_payload
 * 어디에도 저장하거나 출력하지 않는다. 호출 직후 별도 참조 없이 메서드 스코프 종료로 폐기된다.
 */
@Service
public class GeneralBankTransactionSyncService implements BankTransactionSyncService {

    /** 동기화 조회 기간 하한(오늘 기준 N 일 전). 최초 동기화·오래된 마지막 거래 모두 이 하한으로 제한한다. */
    private static final int LOOKBACK_DAYS = 14;

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final ClubAuthService clubAuthService;
    private final BankMatchingAdminService bankMatchingAdminService;
    private final FeeAccountRepository feeAccountRepository;
    private final FeeAccountCipher feeAccountCipher;
    private final BankCodeMapper bankCodeMapper;
    private final BankApiClient bankApiClient;
    private final TransactionHasher transactionHasher;
    private final BankTransactionRepository bankTransactionRepository;
    private final TransactionMatcher transactionMatcher;
    private final Clock clock;
    /** 외부 BANK 호출은 트랜잭션 밖에서 끝내고, 적재 단계만 이 템플릿으로 짧게 트랜잭션을 연다. */
    private final TransactionTemplate transactionTemplate;
    /** 신규 적재된 BANK 거래를 회계 장부(cashbook_entry)에 멱등 생성한다(타 도메인은 서비스 인터페이스로만 교차). */
    private final CashbookService cashbookService;

    public GeneralBankTransactionSyncService(
            ClubAuthService clubAuthService,
            BankMatchingAdminService bankMatchingAdminService,
            FeeAccountRepository feeAccountRepository,
            FeeAccountCipher feeAccountCipher,
            BankCodeMapper bankCodeMapper,
            BankApiClient bankApiClient,
            TransactionHasher transactionHasher,
            BankTransactionRepository bankTransactionRepository,
            TransactionMatcher transactionMatcher,
            Clock clock,
            PlatformTransactionManager platformTransactionManager,
            CashbookService cashbookService) {
        this.clubAuthService = clubAuthService;
        this.bankMatchingAdminService = bankMatchingAdminService;
        this.feeAccountRepository = feeAccountRepository;
        this.feeAccountCipher = feeAccountCipher;
        this.bankCodeMapper = bankCodeMapper;
        this.bankApiClient = bankApiClient;
        this.transactionHasher = transactionHasher;
        this.bankTransactionRepository = bankTransactionRepository;
        this.transactionMatcher = transactionMatcher;
        this.clock = clock;
        this.transactionTemplate = new TransactionTemplate(platformTransactionManager);
        this.cashbookService = cashbookService;
    }

    /**
     * 외부 BANK API 호출을 DB 트랜잭션 밖에서 수행하는 fetch-then-persist 구조다.
     *
     * <p>권한·사용가능 검증, 계좌 복호화, 시작일 계산, 외부 거래 조회까지는 쓰기 트랜잭션을 잡지 않고
     * (조회는 독립 auto-commit 으로 충분) 진행한다. 이렇게 해야 응답이 느리거나 멈춘 BANK API 가
     * 고정 크기 커넥션 풀의 슬롯을 점유해 무관한 요청까지 막는 일을 방지할 수 있다. 적재(native insert)는
     * 활성 트랜잭션을 요구하므로, 외부 조회 결과를 받은 뒤에만 {@link TransactionTemplate} 로
     * 짧은 트랜잭션을 열어 처리한다.
     */
    @Override
    public SyncResult sync(SyncTransactionsCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());      // 권한: 운영진(LEADER/OFFICER)
        bankMatchingAdminService.requireActiveUsable(command.clubId());           // 사용 가능(active && api_registered) 검증
        FeeAccount account = feeAccountRepository.findByClubId(command.clubId())
                .orElseThrow(BankMatchingException.FeeAccountRequiredException::new);
        String bankCode = bankCodeMapper.toApiCode(account.getBank());
        // 복호화 실패(키 회전·AAD 불일치·암호문 손상)는 불투명한 500 대신 처리 불가(422)로 닫는다 — setActive 와 동일 정책.
        // 암호·평문·인증정보 등 어떤 세부정보도 메시지에 싣지 않는다.
        String accountNumber;
        try {
            accountNumber = feeAccountCipher.decrypt(account.getAccountNumber(), command.clubId());
        } catch (RuntimeException decryptFailure) {
            throw new BankMatchingException.AccountDecryptFailedException();
        }

        LocalDate today = LocalDate.now(clock);
        LocalDate startDate = resolveStartDate(command.clubId(), today);

        // 민감 인증정보(계좌 비번·주민번호 앞 6자리)는 오직 이 BANK API 호출에만 전달한다.
        // 이후 어떤 변수에도 보관하지 않으며, 적재·로깅·예외에 절대 싣지 않는다.
        // DB 커넥션을 잡지 않은 상태에서 호출해, 느린 BANK API 가 풀 슬롯을 점유하지 않게 한다.
        List<BankTransactionData> fetchedTransactions = bankApiClient.getTransactions(
                new TransactionLookupCommand(
                        bankCode, accountNumber,
                        command.accountPassword(), command.residentNumber(),
                        startDate, today));

        // 외부 조회가 끝난 뒤에만 짧은 쓰기 트랜잭션을 열어 적재한다(native insert 는 활성 트랜잭션 필요).
        PersistResult persistResult = transactionTemplate.execute(
                status -> persist(command.clubId(), bankCode, fetchedTransactions));
        // execute 는 rollback-only 등에서 null 을 반환할 수 있다(@Nullable). 적재 결과가 없으면 매칭 없이 조회 건수만 보고한다.
        if (persistResult == null) {
            return new SyncResult(fetchedTransactions.size(), 0, 0, 0);
        }

        // 적재 트랜잭션이 커밋된 뒤에야 매칭을 시도한다. 각 tryAutoMatch 는 거래·청구를 비관적 잠금하고
        // 자체 트랜잭션으로 납부를 생성하며, 자동확인 알림(AFTER_COMMIT)도 매칭별로 개별 발화한다.
        // 매칭 루프는 적재 템플릿 밖에 둬야 한다 — 같은 트랜잭션이면 AFTER_COMMIT 알림이 동기화 종료까지 미뤄진다.
        List<BankTransaction> newDeposits = persistResult.newDeposits();
        int autoMatched = 0;
        for (BankTransaction deposit : newDeposits) {
            if (transactionMatcher.tryAutoMatch(deposit, command.actorId())) {
                autoMatched++;
            }
        }
        return new SyncResult(
                fetchedTransactions.size(), persistResult.newlyStored(),
                autoMatched, newDeposits.size() - autoMatched);
    }

    private PersistResult persist(Long clubId, String bankCode, List<BankTransactionData> fetchedTransactions) {
        List<String> insertedHashes = new ArrayList<>();
        for (BankTransactionData transaction : fetchedTransactions) {
            String transactionHash = transactionHasher.hash(clubId, bankCode, transaction);
            boolean isDeposit = transaction.isDeposit();
            String transactionType = isDeposit ? "DEPOSIT" : "WITHDRAWAL";
            String matchStatus = isDeposit ? "PENDING" : "IGNORED";
            // BANK API 페이로드의 거래 시각은 KST 벽시계다(BankTransactionData 계약). 해시는 그 벽시계
            // 문자열 그대로 계산하고(멱등성 계약), 저장만 여기서 절대시각으로 변환한다.
            int inserted = bankTransactionRepository.insertIgnoringConflict(
                    clubId, bankCode, transaction.transactionAt().atZone(SEOUL).toInstant(),
                    transaction.amount(), transaction.balance(), transaction.counterparty(),
                    transactionType, matchStatus, null, transactionHash,
                    transaction.rawJson());   // raw_payload 는 BANK API 응답 거래만 — 인증정보는 절대 들어가지 않는다
            if (inserted == 1) {
                insertedHashes.add(transactionHash);
            }
        }

        // 신규 적재된 BANK 거래(입금/출금 모두)를 회계 장부에 멱등 생성한다(같은 적재 트랜잭션 내 원자적).
        if (!insertedHashes.isEmpty()) {
            cashbookService.generateFromBankTransactions(insertedHashes);
        }

        // 매칭은 트랜잭션 밖에서 수행하므로, 이번에 신규 적재된 PENDING 입금 엔티티(=매칭 후보)를 그대로 넘긴다.
        List<BankTransaction> newDeposits = findNewlyStoredDeposits(insertedHashes);
        return new PersistResult(insertedHashes.size(), newDeposits);
    }

    private List<BankTransaction> findNewlyStoredDeposits(List<String> insertedHashes) {
        if (insertedHashes.isEmpty()) {
            return List.of();
        }
        return bankTransactionRepository.findByTransactionHashIn(insertedHashes).stream()
                .filter(BankTransaction::isPending)
                .filter(BankTransaction::isDeposit)
                .toList();
    }

    /** 적재 트랜잭션 산출물. 신규 적재 건수와, 트랜잭션 밖에서 매칭할 신규 PENDING 입금 거래들을 함께 전달한다. */
    private record PersistResult(int newlyStored, List<BankTransaction> newDeposits) {}

    /**
     * 조회 시작일을 결정한다. 마지막 적재 거래가 있으면 그 하루 전부터(경계 거래 누락 방지),
     * 없으면 기간 하한부터 조회한다. 어떤 경우든 하한({@code today - LOOKBACK_DAYS}) 아래로 내려가지 않는다.
     */
    private LocalDate resolveStartDate(Long clubId, LocalDate today) {
        LocalDate lowerBound = today.minusDays(LOOKBACK_DAYS);
        Instant latest = bankTransactionRepository.findLatestTransactionAt(clubId).orElse(null);
        if (latest == null) {
            return lowerBound;
        }
        // BANK API 조회 시작일은 KST 날짜라 마지막 거래도 KST 달력으로 환산해 하루를 뺀다.
        LocalDate fromLatest = latest.atZone(SEOUL).toLocalDate().minusDays(1);
        return fromLatest.isBefore(lowerBound) ? lowerBound : fromLatest;
    }
}
