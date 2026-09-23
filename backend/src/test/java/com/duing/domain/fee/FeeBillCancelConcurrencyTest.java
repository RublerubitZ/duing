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
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.fee.service.FeeBillService;
import com.duing.domain.fee.service.PaymentService;
import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
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
 * 납부 기록(record)이 청구 행 잠금을 쥔 채 커밋 직전인 순간에 취소(cancel)가 들어오는 경합을 실스레드로 재현한다.
 * 취소가 청구를 무잠금으로 읽으면 record 커밋 직후 그 위에 CANCELLED 를 덮어써, 활성 납부가 취소 청구에 고아로 남는다.
 * 청구 행 잠금으로 두 작업이 직렬화되면 취소는 record 커밋을 기다린 뒤 방금 들어온 납부를 보고 409 로 거절돼야 한다.
 *
 * <p>sleep 대신 pg_blocking_pids 로 "취소가 record 트랜잭션에 막혀 대기 중"임을 확인한 뒤 record 를 커밋시킨다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FeeBillCancelConcurrencyTest extends IntegrationTestBase {

    @Autowired FeeBillService feeBillService;
    @Autowired PaymentService paymentService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("납부 기록 커밋 직후 들어온 청구 취소는 그 납부를 보고 409 로 거절되며 청구·납부가 그대로 남는다")
    void cancelRacingWithRecordIsRejectedAfterRecordCommits() throws Exception {
        Club club = clubRepository.save(ClubFixture.academic("취소·납부 경합 동아리"));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", club.getId());
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(club.getId(), BillingType.MONTHLY, 10000L));
        // 고정 시계 없이 이번 달 회차(마감=말일, 오늘 이후)로 둬 부분 납부 후 PARTIAL_PAID 가 결정적이다.
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        LocalDate start = today.withDayOfMonth(1);
        LocalDate end = today.withDayOfMonth(today.lengthOfMonth());
        FeeBill bill = feeBillRepository.save(FeeBill.issue(club.getId(), leader.getId(), policy.getId(),
                10000L, start.toString().substring(0, 7), start, end, end));

        CountDownLatch recorded = new CountDownLatch(1);
        CountDownLatch releaseCommit = new CountDownLatch(1);
        AtomicInteger recordBackendPid = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            // record 트랜잭션: 청구 잠금 + 납부 INSERT 까지 마치고 커밋 직전에 멈춘다.
            Future<?> recordFuture = pool.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                paymentService.record(new RecordPaymentCommand(club.getId(), leader.getId(), bill.getId(),
                        4000L, PaymentMethod.CASH, today, null));
                recordBackendPid.set(jdbcTemplate.queryForObject("SELECT pg_backend_pid()", Integer.class));
                recorded.countDown();
                try {
                    assertThat(releaseCommit.await(20, TimeUnit.SECONDS)).isTrue();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                }
            }));
            assertThat(recorded.await(20, TimeUnit.SECONDS)).isTrue();

            Future<Throwable> cancelFuture = pool.submit(() -> {
                try {
                    feeBillService.cancel(club.getId(), leader.getId(), bill.getId());
                    return null;
                } catch (Throwable failure) {
                    return failure;
                }
            });

            // 취소가 record 트랜잭션의 행 잠금에 막혀 대기하는 것을 확인한 뒤에 record 를 커밋시킨다.
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!isBlockedBy(recordBackendPid.get())) {
                assertThat(System.nanoTime()).as("취소가 record 잠금 대기에 들어가야 한다").isLessThan(deadline);
                Thread.sleep(20); // 폴링 간격 — 러너 부하에서 커넥션 풀·DB 를 연속 조회로 때리지 않는다
            }
            releaseCommit.countDown();
            recordFuture.get(20, TimeUnit.SECONDS);

            assertThat(cancelFuture.get(20, TimeUnit.SECONDS))
                    .isInstanceOf(FeeBillException.CancelWithActivePaymentsException.class);
        } finally {
            releaseCommit.countDown();
            pool.shutdownNow();
            assertThat(pool.awaitTermination(20, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus())
                .isEqualTo(FeeStatus.PARTIAL_PAID);
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(4000L);
    }

    private boolean isBlockedBy(int blockerPid) {
        Integer waiting = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))",
                Integer.class, blockerPid);
        return waiting != null && waiting > 0;
    }
}
