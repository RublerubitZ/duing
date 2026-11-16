package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentCreateConcurrencyTest extends IntegrationTestBase {

    /** 상대 마감이 넣는 눈에 띄는 종료 시각 — 자동 마감이 덮으면 이 값이 사라진다. */
    private static final LocalDateTime RIVAL_CLOSED_AT = LocalDateTime.of(2026, 1, 2, 3, 4, 5);

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired EntityManager entityManager;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 동시에 모집을 생성해도 정확히 한 건만 성공하고 OPEN 상태 모집은 1건만 남는다")
    void concurrentCreatesLeaveExactlyOneActiveRecruitment() throws Exception {
        User leaderA = saveUser("리더A", UserRole.STUDENT);
        User leaderB = saveUser("리더B", UserRole.STUDENT);
        Club club = saveActiveClub("동시생성동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderA));
        clubMemberRepository.save(ClubMember.of(club, leaderB,
                com.duing.domain.clubmember.entity.ClubMemberRole.OFFICER));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> taskA = () -> tryCreate(buildExternalCommand(club, leaderA, "모집A"));
        Callable<Throwable> taskB = () -> tryCreate(buildExternalCommand(club, leaderB, "모집B"));

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(taskA, taskB));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 생성 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract 1: 정확히 한 건만 성공 — race 가 두 OPEN 행을 동시에 만들지 못한다.
        long successes = outcomes.stream().map(this::quietGet).filter(throwable -> throwable == null).count();
        assertThat(successes).as("정확히 한 건만 성공").isEqualTo(1);

        // 핵심 contract 2: DB 에 OPEN 상태 모집은 1건만 남는다.
        long openCount = recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(club.getId())
                .stream()
                .filter(recruitment -> recruitment.getStatus() == RecruitmentStatus.OPEN)
                .count();
        assertThat(openCount).as("OPEN 상태 모집은 1건만 존재").isEqualTo(1);
    }

    @Test
    @DisplayName("기간 연장이 모집 행을 잠근 사이 들어온 새 모집 생성은 기다렸다가 연장된 모집을 보고 중복으로 거절된다")
    void createWaitsForExtensionAndIsRejectedAsDuplicate() throws Exception {
        User leader = saveUser("연장경합리더", UserRole.STUDENT);
        Club club = saveActiveClub("연장경합동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment expiredOpen = saveExpiredOpenRecruitment(club);
        LocalDate extendedEndDate = LocalDate.now().plusDays(30);

        Throwable createFailure = requestWhileRowLockedBy(
                "UPDATE recruitment SET end_date = :extended WHERE id = :id",
                Map.of("extended", extendedEndDate, "id", expiredOpen.getId()),
                () -> tryCreate(buildExternalCommand(club, leader, "새모집")));

        assertThat(createFailure)
                .as("잠금이 없으면 만료된 옛 값을 읽어 연장을 되돌리고 마감한 뒤 새 모집을 만든다")
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
        Recruitment reloaded = recruitmentRepository.findById(expiredOpen.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(reloaded.getEndDate()).isEqualTo(extendedEndDate);
        assertThat(recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(club.getId()))
                .hasSize(1);
    }

    @Test
    @DisplayName("마감이 모집 행을 잠근 사이 들어온 새 모집 생성은 기다렸다가 마감된 모집을 건드리지 않고 생성한다")
    void createWaitsForCloseAndLeavesClosedRecruitmentUntouched() throws Exception {
        User leader = saveUser("마감경합리더", UserRole.STUDENT);
        Club club = saveActiveClub("마감경합동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment expiredOpen = saveExpiredOpenRecruitment(club);

        Throwable createFailure = requestWhileRowLockedBy(
                "UPDATE recruitment SET status = 'CLOSED', closed_at = :closedAt WHERE id = :id",
                Map.of("closedAt", RIVAL_CLOSED_AT, "id", expiredOpen.getId()),
                () -> tryCreate(buildExternalCommand(club, leader, "새모집")));

        assertThat(createFailure).isNull();
        assertThat(recruitmentRepository.findById(expiredOpen.getId()).orElseThrow().getClosedAt())
                .as("잠금이 없으면 옛 OPEN 을 읽어 자동 마감하면서 종료 시각을 덮는다")
                .isEqualTo(RIVAL_CLOSED_AT);
        assertThat(recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(club.getId()))
                .filteredOn(recruitment -> recruitment.getStatus() == RecruitmentStatus.OPEN)
                .singleElement()
                .extracting(Recruitment::getId)
                .isNotEqualTo(expiredOpen.getId());
    }

    /** 기간이 지났지만 아직 OPEN 인 모집 — 서비스 검증(종료일 과거 거절)을 거치지 않게 저장소로 직접 넣는다. */
    private Recruitment saveExpiredOpenRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.create(club, "만료된 모집", null,
                LocalDate.now().minusDays(10), LocalDate.now().minusDays(3), 10));
    }

    /**
     * 상대 트랜잭션이 네이티브 UPDATE 로 모집 행을 잠근 채 커밋 직전에 멈춘 사이 요청을 보내고, 요청이 잠금 대기에 들어간 뒤
     * 상대를 커밋시켜 요청의 결과를 돌려준다. 판정은 결과로 한다 — 잠그지 않는 전 컬럼 UPDATE 도 행 잠금에서 기다린다.
     */
    private <T> T requestWhileRowLockedBy(String rivalUpdateSql, Map<String, Object> rivalParameters,
                                          Callable<T> request) throws Exception {
        CountDownLatch rivalHoldsRowLock = new CountDownLatch(1);
        CountDownLatch rivalMayCommit = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<?> rival = executor.submit(() -> transactionTemplate.executeWithoutResult(transaction -> {
                Query rivalUpdate = entityManager.createNativeQuery(rivalUpdateSql);
                rivalParameters.forEach((name, value) -> rivalUpdate.setParameter(name, value));
                rivalUpdate.executeUpdate();
                rivalHoldsRowLock.countDown();
                awaitQuietly(rivalMayCommit);
            }));
            assertThat(rivalHoldsRowLock.await(10, TimeUnit.SECONDS))
                    .as("상대 트랜잭션이 모집 행 잠금을 획득").isTrue();

            Future<T> requesting = executor.submit(request);
            awaitBlockedLock();
            rivalMayCommit.countDown();
            rival.get(30, TimeUnit.SECONDS);
            return requesting.get(30, TimeUnit.SECONDS);
        } finally {
            rivalMayCommit.countDown();
            executor.shutdownNow();
        }
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    /** 다른 세션이 행 잠금(트랜잭션 id·튜플)을 기다리기 시작할 때까지 폴링한다 — 폴링하는 이 연결은 빼고 센다. */
    private void awaitBlockedLock() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM pg_locks
                     WHERE NOT granted AND pid <> pg_backend_pid() AND locktype IN ('transactionid', 'tuple')
                    """, Integer.class);
            if (blocked != null && blocked > 0) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("잠금 대기 폴링이 중단되었다.", interrupted);
            }
        }
        throw new IllegalStateException("모집 생성이 제한 시간 안에 모집 행 잠금 대기에 진입하지 않았다.");
    }

    private Throwable tryCreate(CreateRecruitmentCommand command) {
        try {
            recruitmentService.create(command);
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

    private CreateRecruitmentCommand buildExternalCommand(Club club, User leader, String title) {
        return new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                title,
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.EXTERNAL,
                "https://forms.gle/aBcD1234",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
