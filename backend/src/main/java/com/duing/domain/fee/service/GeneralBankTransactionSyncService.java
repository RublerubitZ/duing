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

    /**
     * 첫 동기화의 조회 기간이자, 매 동기화가 다시 훑는 최소 기간·자동매칭 범위(오늘 기준 N 일 전).
     * 마지막 거래일은 동아리 단위라 계좌를 바꾼 직후엔 옛 계좌의 날짜다 — 이 기간을 늘 다시 봐야 새 계좌의 앞선 입금이 빠지지 않는다.
     */
    private static final int LOOKBACK_DAYS = 14;

    // shortcut: 한 번에 오늘 포함 31일까지만 조회한다 — 근거는 제공사 문서의 요청 예시(20260101~20260131)뿐이고 은행별 최대 조회 기간은
    // 확인하지 못했다(넘기면 은행이 거절해 그 동아리 동기화가 매번 실패한다). 제공사 확인이나 운영 실측으로 더 긴 기간이 되면 올린다.
    private static final int MAX_LOOKBACK_DAYS = 30;

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
        // BANK API 조회일은 KST 날짜라 마지막 거래도 KST 달력으로 환산한다.
        LocalDate latestTransactionDate = bankTransactionRepository.findLatestTransactionAt(command.clubId())
                .map(latest -> latest.atZone(SEOUL).toLocalDate())
                .orElse(null);
        SyncWindow window = resolveWindow(today, latestTransactionDate);

        // 민감 인증정보(계좌 비번·주민번호 앞 6자리)는 오직 이 BANK API 호출에만 전달한다.
        // 이후 어떤 변수에도 보관하지 않으며, 적재·로깅·예외에 절대 싣지 않는다.
        // DB 커넥션을 잡지 않은 상태에서 호출해, 느린 BANK API 가 풀 슬롯을 점유하지 않게 한다.
        List<BankTransactionData> fetchedTransactions = bankApiClient.getTransactions(
                new TransactionLookupCommand(
                        bankCode, accountNumber,
                        command.accountPassword(), command.residentNumber(),
                        window.startDate(), today));

        // 외부 조회가 끝난 뒤에만 짧은 쓰기 트랜잭션을 열어 적재한다(native insert 는 활성 트랜잭션 필요).
        PersistResult persistResult = transactionTemplate.execute(
                status -> persist(command.clubId(), bankCode, fetchedTransactions));
        // execute 는 rollback-only 등에서 null 을 반환할 수 있다(@Nullable). 적재 결과가 없으면 매칭 없이 조회 건수만 보고한다.
        if (persistResult == null) {
            return new SyncResult(fetchedTransactions.size(), 0, 0, 0, window.missedFrom(), window.missedTo());
        }

        // 적재 트랜잭션이 커밋된 뒤에야 매칭을 시도한다. 각 tryAutoMatch 는 거래·청구를 비관적 잠금하고
        // 자체 트랜잭션으로 납부를 생성하며, 자동확인 알림(AFTER_COMMIT)도 매칭별로 개별 발화한다.
        // 매칭 루프는 적재 템플릿 밖에 둬야 한다 — 같은 트랜잭션이면 AFTER_COMMIT 알림이 동기화 종료까지 미뤄진다.
        // 쉰 기간에서 되살린 입금(최근 LOOKBACK_DAYS 일보다 앞)은 자동매칭하지 않고 검토 대기로 둔다 — 그동안 운영진이 수기로
        // 처리했을 수 있는데 Tier 1 은 금액만 봐 같은 금액의 다른 회원 청구에 붙을 수 있다. 자동매칭 범위는 수정 전과 같다.
        Instant autoMatchFrom = today.minusDays(LOOKBACK_DAYS).atStartOfDay(SEOUL).toInstant();
        List<BankTransaction> newDeposits = persistResult.newDeposits();
        int autoMatched = 0;
        for (BankTransaction deposit : newDeposits) {
            if (!deposit.getTransactionAt().isBefore(autoMatchFrom)
                    && transactionMatcher.tryAutoMatch(deposit, command.actorId())) {
                autoMatched++;
            }
        }
        return new SyncResult(
                fetchedTransactions.size(), persistResult.newlyStored(),
                autoMatched, newDeposits.size() - autoMatched,
                window.missedFrom(), window.missedTo());
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

    /** 조회 시작일과, 상한에 잘려 이번에 조회하지 못한 기간(잘리지 않았으면 둘 다 null). 날짜는 모두 KST. */
    record SyncWindow(LocalDate startDate, LocalDate missedFrom, LocalDate missedTo) {}

    /**
     * 조회 기간을 정한다. 마지막 적재 거래 전날(경계 거래 누락 방지)과 오늘 − {@code LOOKBACK_DAYS} 가운데 이른 날부터 조회하되
     * 오늘 − {@code MAX_LOOKBACK_DAYS} 보다 앞으로는 가지 않는다. 마지막 거래일까지 잘리면 그날부터 조회 시작 전날까지를 함께 돌려준다.
     * 경계용 전날 하루만 잘리는 것은 알리지 않는다 — 이전 동기화가 이미 본 날이라, 알리면 월 1회 같은 날 동기화마다 거짓 경고가 뜬다.
     */
    static SyncWindow resolveWindow(LocalDate today, LocalDate latestTransactionDate) {
        LocalDate lowerBound = today.minusDays(LOOKBACK_DAYS);
        if (latestTransactionDate == null) {
            return new SyncWindow(lowerBound, null, null);
        }
        LocalDate oldestAllowed = today.minusDays(MAX_LOOKBACK_DAYS);
        if (latestTransactionDate.isBefore(oldestAllowed)) {
            return new SyncWindow(oldestAllowed, latestTransactionDate, oldestAllowed.minusDays(1));
        }
        LocalDate fromLatest = latestTransactionDate.minusDays(1);
        LocalDate wanted = fromLatest.isBefore(lowerBound) ? fromLatest : lowerBound;
        return new SyncWindow(wanted.isBefore(oldestAllowed) ? oldestAllowed : wanted, null, null);
    }
}
