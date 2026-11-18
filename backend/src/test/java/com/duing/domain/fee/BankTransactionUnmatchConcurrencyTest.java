package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.TransactionType;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.service.BankTransactionReviewService;
import com.duing.domain.fee.service.PaymentService;
import com.duing.domain.fee.service.dto.command.VoidPaymentCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 청구 쪽 납부 정정이 청구 행 잠금을 쥔 채 커밋 직전인 순간에 같은 거래의 매칭취소가 들어오는 경합을 실스레드로 재현한다.
 * 매칭취소는 아직 활성인 납부를 보고 청구 잠금을 기다렸다가, 잠금을 얻은 뒤 재조회에서 이미 정정된 납부를 본다.
 * 이때 예외로 롤백하면 거래가 매칭됨에 갇히므로, 정정 사유를 덮어쓰지 않고 거래만 매칭 대기로 되돌려야 한다.
 *
 * <p>sleep 대신 pg_blocking_pids 로 "매칭취소가 정정 트랜잭션에 막혀 대기 중"임을 확인한 뒤 정정을 커밋시킨다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class BankTransactionUnmatchConcurrencyTest extends IntegrationTestBase {

    @Autowired BankTransactionReviewService bankTransactionReviewService;
    @Autowired PaymentService paymentService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired BankTransactionRepository bankTransactionRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("납부 정정 커밋을 기다린 매칭취소는 정정 사유를 덮어쓰지 않고 거래만 매칭 대기로 되돌린다")
    void unmatchWaitingForVoidCommitReleasesTransactionOnly() throws Exception {
        Club club = clubRepository.save(ClubFixture.academic("매칭취소·정정 경합 동아리"));
        Long clubId = club.getId();
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(club, member));
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, 10000L));
        // 마감일을 실행 시점 기준 30일 뒤로 둬 정정 뒤 청구가 결정적으로 PENDING 이다(시한폭탄 방지).
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        YearMonth period = YearMonth.from(today);
        FeeBill bill = feeBillRepository.save(FeeBill.issue(clubId, member.getId(), policy.getId(), 10000L,
                period.toString(), period.atDay(1), period.atEndOfMonth(), today.plusDays(30)));
        BankTransaction deposit = bankTransactionRepository.save(BankTransaction.ingest(
                clubId, "011", Instant.now().minusSeconds(3600), 10000L, 100000L,
                "홍길동", TransactionType.DEPOSIT, "hash-unmatch-race", "{\"type\":\"deposit\"}"));
        bankTransactionReviewService.approve(clubId, leader.getId(), deposit.getId(), bill.getId());
        Long paymentId = jdbcTemplate.queryForObject(
                "SELECT id FROM payment WHERE bank_transaction_id = ?", Long.class, deposit.getId());

        CountDownLatch voided = new CountDownLatch(1);
        CountDownLatch releaseCommit = new CountDownLatch(1);
        AtomicInteger voidBackendPid = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Throwable unmatchFailure;
        try {
            // 정정 트랜잭션: 청구 잠금 + VOID 까지 마치고 커밋 직전에 멈춘다.
            Future<?> voidFuture = pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                paymentService.voidPayment(new VoidPaymentCommand(
                        clubId, leader.getId(), bill.getId(), paymentId, "다른 회원 입금"));
                voidBackendPid.set(jdbcTemplate.queryForObject("SELECT pg_backend_pid()", Integer.class));
                voided.countDown();
                try {
                    assertThat(releaseCommit.await(20, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                }
            }));
            assertThat(voided.await(20, TimeUnit.SECONDS)).isTrue();

            // 매칭취소: 거래 잠금 → 활성 납부(아직 커밋 전이라 ACTIVE 로 보임) → 청구 잠금에서 대기.
            Future<Throwable> unmatchFuture = pool.submit(() -> {
                try {
                    bankTransactionReviewService.unmatch(clubId, leader.getId(), deposit.getId());
                    return null;
                } catch (Throwable failure) {
                    return failure;
                }
            });

            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!isBlockedBy(voidBackendPid.get())) {
                assertThat(System.nanoTime()).as("매칭취소가 정정의 청구 잠금 대기에 들어가야 한다").isLessThan(deadline);
                Thread.sleep(20); // 폴링 간격 — 러너 부하에서 커넥션 풀·DB 를 연속 조회로 때리지 않는다
            }
            releaseCommit.countDown();
            voidFuture.get(20, TimeUnit.SECONDS);
            unmatchFailure = unmatchFuture.get(20, TimeUnit.SECONDS);
        } finally {
            releaseCommit.countDown();
            pool.shutdownNow();
            assertThat(pool.awaitTermination(20, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(unmatchFailure).as("수정 전에는 MatchedPaymentNotFoundException(409)로 롤백됐다").isNull();
        BankTransaction released = bankTransactionRepository.findById(deposit.getId()).orElseThrow();
        assertThat(released.getMatchStatus()).isEqualTo(MatchStatus.PENDING);
        assertThat(released.getMatchedFeeBillId()).isNull();
        assertThat(jdbcTemplate.queryForObject("SELECT void_reason FROM payment WHERE id = ?", String.class, paymentId))
                .isEqualTo("다른 회원 입금");
        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus()).isEqualTo(FeeStatus.PENDING);
        assertThat(countEvents("FEE_PAYMENT_VOIDED")).as("정정 감사는 청구 쪽 정정의 1건뿐").isEqualTo(1);
        assertThat(countEvents("FEE_TX_UNMATCHED")).isEqualTo(1);
    }

    private int countEvents(String eventType) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_audit_event WHERE event_type = ?", Integer.class, eventType);
        return count == null ? 0 : count;
    }

    private boolean isBlockedBy(int blockerPid) {
        Integer waiting = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))",
                Integer.class, blockerPid);
        return waiting != null && waiting > 0;
    }
}
