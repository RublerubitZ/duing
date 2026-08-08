package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.service.dto.command.CreateClubInviteCodeCommand;
import com.duing.domain.joincode.service.dto.command.CreateJoinRequestCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDateTime;
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
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 부원 초대 링크(V107)의 동시성 계약을 실제 스레드로 검증한다 — 발급 경쟁·자동 승인 소진 경쟁·
 * 수동 폐기와 재발급의 경쟁 세 축(레포 동시성 테스트 전례 미러).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubInviteConcurrencyTest extends IntegrationTestBase {

    @Autowired JoinCodeService joinCodeService;
    @Autowired JoinRequestService joinRequestService;
    @Autowired JoinCodeRateLimiter joinCodeRateLimiter;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    /** 만료 시각은 프로덕션과 같은 seoulClock 으로 만든다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void resetRateLimiter() {
        // @SpringBootTest 컨텍스트 공유로 누적된 IP 창이 두 스레드를 429 로 밀어내지 않도록 초기화한다.
        joinCodeRateLimiter.reset();
    }

    @Test
    @DisplayName("두 운영진이 같은 동아리에 동시에 초대 링크를 발급해도 활성 링크는 정확히 1개만 남는다")
    void concurrentCreateLeavesSingleActiveInvite() throws Exception {
        Club club = saveActiveClub();
        User leader = saveLeaderOf(club);
        User officer = saveOfficerOf(club);

        // 걸쇠 없이는 두 INSERT 가 겹치지 않고 순차 재발급(뒤가 앞을 폐기) 경로로 빠져 409 매핑이
        // 한 번도 행사되지 않은 채 통과할 수 있다 — 두 스레드를 같은 순간에 풀어 경쟁을 실제로 만든다.
        CountDownLatch startGate = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> awaitThen(startGate, () -> tryCreateInvite(club.getId(), leader.getId())),
                () -> awaitThen(startGate, () -> tryCreateInvite(club.getId(), officer.getId())),
                startGate);

        // 핵심 contract 1: 최소 한쪽은 성공한다(둘 다 거부되면 운영진이 링크를 못 만든다).
        assertThat(failures).as("두 발급이 모두 실패해서는 안 된다").hasSizeLessThan(2);
        // 핵심 contract 2: 실패한다면 재시도 가능한 409 로만 표면화된다(제약 위반 500 누출 금지).
        assertThat(failures).allSatisfy(failure -> assertThat(failure)
                .isInstanceOf(JoinCodeException.ConcurrentJoinCodeOperationException.class));
        // 핵심 contract 3: uk_club_join_code_active_invite_per_club 이 동아리당 다중 활성 링크를 막는다.
        assertThat(activeInviteCount(club)).as("활성 초대 링크는 정확히 1개").isEqualTo(1);
    }

    @Test
    @DisplayName("잔여 1명인 자동 승인 초대 링크에 두 학생이 동시에 신청하면 한 명만 즉시 가입된다")
    void concurrentAutoApproveNeverExceedsMaxUses() throws Exception {
        Club club = saveActiveClub();
        User firstStudent = saveUser();
        User secondStudent = saveUser();
        ClubJoinCode inviteCode = saveInvite(club, "INVCC1", 1, true, null);

        // 걸쇠로 두 신청을 같은 순간에 풀어 잔여 1자리를 두고 실제로 경쟁시킨다.
        CountDownLatch startGate = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> awaitThen(startGate, () -> tryCreateRequest(inviteCode.getCode(), firstStudent.getId())),
                () -> awaitThen(startGate, () -> tryCreateRequest(inviteCode.getCode(), secondStudent.getId())),
                startGate);

        assertThat(failures).as("잔여 1명이므로 정확히 한 명만 접수된다").hasSize(1);
        assertThat(failures.get(0))
                .as("소진은 학생에게 사유를 구분하지 않는 409 로만 표면화된다")
                .isInstanceOf(JoinRequestException.UnusableJoinCodeException.class);
        // 자동 승인은 접수와 같은 잠금 구간 안에서 가입까지 끝내므로 회원·승인 요청도 1건씩이어야 한다.
        assertThat(countOf("SELECT COUNT(*) FROM club_member WHERE club_id = ? AND deleted_at IS NULL",
                club.getId())).as("자동 승인으로 가입한 회원은 1명").isEqualTo(1);
        assertThat(countOf("SELECT COUNT(*) FROM club_join_request "
                        + "WHERE club_id = ? AND status = 'APPROVED' AND deleted_at IS NULL", club.getId()))
                .as("승인된 가입 요청도 1건").isEqualTo(1);
        assertThat(clubJoinCodeRepository.findById(inviteCode.getId()).orElseThrow().getUsedCount())
                .as("최대 사용 인원을 넘겨 차감되지 않는다").isEqualTo(1);
    }

    @Test
    @DisplayName("초대 링크 수동 폐기와 재발급이 동시에 일어나도 구 링크의 폐기 기록은 최초 1건만 남는다")
    void concurrentRevokeAndRegenerateKeepsSingleRevocation() throws Exception {
        Club club = saveActiveClub();
        User leader = saveLeaderOf(club);
        User officer = saveOfficerOf(club);
        ClubJoinCode oldInvite = saveInvite(club, "INVCC2", 30, false, leader.getId());

        // 걸쇠로 두 스레드를 같은 순간에 풀어 인터리빙 확률을 높인다(레포 동시성 테스트 전례).
        CountDownLatch startGate = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> awaitThen(startGate, () -> tryRevokeInvite(club.getId(), oldInvite.getId(), leader.getId())),
                () -> awaitThen(startGate, () -> tryCreateInvite(club.getId(), officer.getId())),
                startGate);

        // 폐기가 먼저면 재발급은 최초 생성이 되고, 재발급이 먼저면 수동 폐기는 멱등으로 끝난다.
        assertThat(failures).as("두 경로 모두 성공한다").isEmpty();

        List<ClubAuditEvent> oldLinkRevocations = revocationEventsOf(oldInvite.getId());
        assertThat(oldLinkRevocations)
                .as("한 번 일어난 폐기가 두 번 기록되면 감사 이력이 거짓말이 된다").hasSize(1);
        ClubJoinCode reloadedOldInvite = clubJoinCodeRepository.findById(oldInvite.getId()).orElseThrow();
        assertThat(reloadedOldInvite.getRevokedAt()).as("구 링크는 어느 순서에서도 폐기된다").isNotNull();
        assertThat(reloadedOldInvite.getRevokedById())
                .as("뒤늦은 경쟁 트랜잭션이 최초 폐기자를 덮어쓰면 행과 감사 이력이 어긋난다")
                .isEqualTo(oldLinkRevocations.get(0).getActorUserId());
        assertThat(activeInviteCount(club)).as("재발급된 활성 링크 1개만 남는다").isEqualTo(1);
    }

    private List<Throwable> runConcurrently(Callable<Throwable> firstTask, Callable<Throwable> secondTask,
                                            CountDownLatch startGate) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes;
        try {
            outcomes = List.of(pool.submit(firstTask), pool.submit(secondTask));
            if (startGate != null) {
                startGate.countDown();
            }
        } finally {
            pool.shutdown();
        }
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS))
                .as("동시성 테스트가 시간 내에 완료").isTrue();
        return outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();
    }

    private Throwable awaitThen(CountDownLatch startGate, Callable<Throwable> task) throws Exception {
        startGate.await();
        return task.call();
    }

    private Throwable tryCreateInvite(Long clubId, Long requesterId) {
        try {
            joinCodeService.createClubInvite(
                    new CreateClubInviteCodeCommand(clubId, requesterId, 30, 24, false, 13));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable tryRevokeInvite(Long clubId, Long joinCodeId, Long requesterId) {
        try {
            joinCodeService.revokeClubInvite(clubId, joinCodeId, requesterId);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable tryCreateRequest(String code, Long userId) {
        try {
            joinRequestService.createRequest(new CreateJoinRequestCommand(code, userId, "127.0.0.1"));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(15, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private List<ClubAuditEvent> revocationEventsOf(Long joinCodeId) {
        return clubAuditEventRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .filter(event -> event.getEventType() == ClubAuditEventType.JOIN_LINK_REVOKED
                        && joinCodeId.equals(event.getJoinCodeId()))
                .toList();
    }

    private int activeInviteCount(Club club) {
        return countOf("SELECT COUNT(*) FROM club_join_code WHERE club_id = ? "
                + "AND recruitment_id IS NULL AND revoked_at IS NULL AND deleted_at IS NULL", club.getId());
    }

    private int countOf(String sql, Long clubId) {
        return Objects.requireNonNull(jdbcTemplate.queryForObject(sql, Integer.class, clubId));
    }

    /** 만료 시각은 하드코딩 절대일자 없이 현재 기준 상대 시각으로 만든다(시한폭탄 테스트 방지). */
    private ClubJoinCode saveInvite(Club club, String code, int maxUses, boolean autoApprove,
                                    Long createdById) {
        return clubJoinCodeRepository.save(ClubJoinCode.issueClubInvite(
                club, code, 13, maxUses, LocalDateTime.now(clock).plusHours(24), autoApprove, createdById));
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private User saveLeaderOf(Club club) {
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return leader;
    }

    private User saveOfficerOf(Club club) {
        User officer = saveUser();
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        return officer;
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("동시초대동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
