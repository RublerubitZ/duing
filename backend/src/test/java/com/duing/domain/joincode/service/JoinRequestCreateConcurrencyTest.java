package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JoinRequestCreateConcurrencyTest extends IntegrationTestBase {

    @Autowired JoinRequestService joinRequestService;
    @Autowired JoinCodeRateLimiter joinCodeRateLimiter;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired JoinCodeService joinCodeService;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void resetRateLimiter() {
        // @SpringBootTest 컨텍스트 공유로 누적된 IP 창이 두 스레드를 429 로 밀어내지 않도록 초기화한다.
        joinCodeRateLimiter.reset();
    }

    @Test
    @DisplayName("같은 사용자가 동시에 두 번 요청해도 PENDING 요청은 1개만 생성된다")
    void concurrentCreateLeavesSinglePendingRequest() throws Exception {
        User student = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        ClubJoinCode joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, saveOpenExternalRecruitment(club), "AB12CD", 12, 30, 7, null));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> requestTask = () -> tryCreate(joinCode.getCode(), student.getId());

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(requestTask, requestTask));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 요청 테스트가 시간 내에 완료").isTrue();

        List<Throwable> failures = outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();

        // 핵심 contract 1: 최소 한쪽은 성공한다(둘 다 거부되면 학생이 가입 요청을 못 만든다).
        assertThat(failures).as("두 요청이 모두 실패해서는 안 된다").hasSizeLessThan(2);
        // 핵심 contract 2: 실패는 409 도메인 예외로만 표면화된다(제약 위반 500 누출 금지).
        assertThat(failures).allSatisfy(failure -> assertThat(failure)
                .isInstanceOf(JoinRequestException.DuplicatePendingRequestException.class));
        // 핵심 contract 3: partial unique 가 다중 PENDING 을 구조적으로 막는다.
        Integer pendingCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_join_request "
                        + "WHERE club_id = ? AND user_id = ? AND status = 'PENDING' AND deleted_at IS NULL",
                Integer.class, club.getId(), student.getId());
        assertThat(pendingCount).as("대기 중인 요청은 정확히 1개").isEqualTo(1);
        assertThat(usedCountOf(joinCode))
                .as("접수된 요청 1건만큼만 자리를 확보한다").isEqualTo(1);
    }

    @Test
    @DisplayName("잔여 1명인 코드에 서로 다른 두 학생이 동시에 신청하면 한 명만 접수된다")
    void concurrentCreateNeverExceedsMaxUses() throws Exception {
        User firstStudent = userRepository.save(UserFixture.unique());
        User secondStudent = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        ClubJoinCode joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, saveOpenExternalRecruitment(club), "EF34GH", 12, 1, 7, null));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(
                () -> tryCreate(joinCode.getCode(), firstStudent.getId()),
                () -> tryCreate(joinCode.getCode(), secondStudent.getId())));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 신청 테스트가 시간 내에 완료").isTrue();

        List<Throwable> failures = outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();

        assertThat(failures).as("잔여 1명이므로 정확히 한 명만 접수된다").hasSize(1);
        assertThat(failures.get(0))
                .as("소진은 학생에게 사유를 구분하지 않는 409 로만 표면화된다")
                .isInstanceOf(JoinRequestException.UnusableJoinCodeException.class);
        assertThat(usedCountOf(joinCode)).as("최대 사용 인원을 넘겨 차감되지 않는다").isEqualTo(1);
        Integer requestCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_join_request WHERE club_id = ? AND deleted_at IS NULL",
                Integer.class, club.getId());
        assertThat(requestCount).as("접수된 요청도 1건").isEqualTo(1);
    }

    @Test
    @DisplayName("폐쇄가 동아리를 잠근 채 링크를 폐기하는 동안 들어온 가입 요청은 교착 없이 상태 게이트로 거절되고 폐쇄는 커밋된다")
    void closureHoldingClubLockRejectsJoinRequestWithoutDeadlock() throws Exception {
        User student = userRepository.save(UserFixture.unique());
        User admin = userRepository.save(UserFixture.admin());
        Club club = saveActiveClub();
        Recruitment recruitment = saveOpenExternalRecruitment(club);
        ClubJoinCode joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, recruitment, "IJ56KL", 12, 30, 7, null));

        CountDownLatch clubLocked = new CountDownLatch(1);
        CountDownLatch requestStarted = new CountDownLatch(1);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes = List.of(
                pool.submit(() -> closeHoldingClubLock(club.getId(), recruitment.getId(), admin.getId(),
                        clubLocked, requestStarted)),
                pool.submit(() -> {
                    clubLocked.await();
                    requestStarted.countDown();
                    return tryCreate(joinCode.getCode(), student.getId());
                }));
        pool.shutdown();
        // 옛 순서(code → club)였다면 요청이 club 잠금에 걸리지 않고 통과해 아래 대기 가드가 타임아웃하고,
        // 폐쇄 중인 동아리로 요청이 접수된다 — 이 테스트는 그 경로를 잠금 대기 진입과 409 로 고정한다.
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("폐쇄와 가입 요청이 시간 내에 완료").isTrue();

        assertThat(quietGet(outcomes.get(0)))
                .as("폐쇄는 교착으로 abort 되지 않고 커밋된다").isNull();
        assertThat(quietGet(outcomes.get(1)))
                .as("가입 요청은 잠금 대기 뒤 폐기된 링크를 보고 409 로 거절된다")
                .isInstanceOf(JoinRequestException.UnusableJoinCodeException.class);

        Integer revokedCodeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_join_code WHERE id = ? AND revoked_at IS NOT NULL",
                Integer.class, joinCode.getId());
        assertThat(revokedCodeCount).as("폐쇄가 링크를 실제로 폐기했다").isEqualTo(1);
        Integer requestCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_join_request WHERE club_id = ? AND deleted_at IS NULL",
                Integer.class, club.getId());
        assertThat(requestCount).as("폐쇄된 동아리로는 요청이 접수되지 않는다").isEqualTo(0);
        assertThat(usedCountOf(joinCode)).as("자리도 차감되지 않는다").isEqualTo(0);
    }

    /**
     * 동아리 폐쇄의 잠금 순서(club FOR UPDATE → 코드 행 벌크 UPDATE)만 재현한다 — 서비스 close 는
     * 커밋 시점을 붙잡을 수 없다. club 을 잠근 뒤 경쟁 스레드가 잠금 대기에 들어갈 때까지 기다리고
     * 나서 운영 중단으로 바꾸고 링크를 폐기한다(폐쇄는 비 ACTIVE 동아리에서만 시작된다).
     */
    private Throwable closeHoldingClubLock(Long clubId, Long recruitmentId, Long adminId,
                                           CountDownLatch clubLocked, CountDownLatch requestStarted) {
        try {
            transactionTemplate.executeWithoutResult(txStatus -> {
                Club lockedClub = clubRepository.findByIdForUpdate(clubId).orElseThrow();
                clubLocked.countDown();
                awaitRequestBlockedOnLock(requestStarted);
                lockedClub.changeStatus(ClubStatus.INACTIVE, null, adminId);
                joinCodeService.revokeActiveOnClubClosure(clubId, List.of(recruitmentId), adminId);
            });
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    /**
     * 경쟁 가입 요청이 실제로 잠금 대기에 들어간 뒤에 폐쇄를 진행시킨다. 대기 진입 전에 커밋하면
     * 요청이 이미 폐기된 링크를 그냥 읽어, 검증하려는 잠금 경로가 한 번도 행사되지 않은 채 통과한다.
     */
    private void awaitRequestBlockedOnLock(CountDownLatch requestStarted) {
        try {
            if (!requestStarted.await(2, TimeUnit.SECONDS)) {
                throw new IllegalStateException("경쟁 가입 요청 스레드가 시작되지 않았다.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("경쟁 스레드 대기가 중단되었다.", interrupted);
        }
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM pg_locks WHERE NOT granted", Integer.class);
            if (blocked != null && blocked > 0) {
                return;
            }
            sleepBriefly();
        }
        throw new IllegalStateException("경쟁 가입 요청이 제한 시간 안에 잠금 대기에 진입하지 않았다.");
    }

    private void sleepBriefly() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("잠금 대기 폴링이 중단되었다.", interrupted);
        }
    }

    private int usedCountOf(ClubJoinCode joinCode) {
        return clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount();
    }

    private Throwable tryCreate(String code, Long userId) {
        try {
            joinRequestService.createRequest(new CreateJoinRequestCommand(code, userId, "127.0.0.1"));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("동시요청동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenExternalRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
