package com.duing.common.fixture;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 총동연 동아리 신호(스펙 §4) 테스트 공용 — 목록 필터·행 재료·홈 집계 동치 테스트가 같은 데이터 모양을 쓰도록 한 곳에 둔다.
 * PendingItemsFixture 처럼 저장까지 하고 리포지토리는 호출 측이 넘긴다. 날짜는 호출 측이 LocalDate.now(clock)(KST) 기준으로 준다.
 * 모집은 모두 면접 사용 모집이다 — 면접 대상(INTERVIEW_PENDING)을 PendingItemsFixture.saveApplication 으로 만들 수 있게.
 */
public final class ClubSignalFixture {

    // 동아리 이름·모집 제목이 테스트 안에서 겹치지 않게 하는 시퀀스(UserFixture 와 같은 방식).
    private static final AtomicLong SEQUENCE = new AtomicLong(System.nanoTime());

    private ClubSignalFixture() {
    }

    /** 이름이 유일한 동아리를 지정 상태로 저장한다 — 승인 절차를 건너뛰고 상태만 바꾼다(PendingItemsFixture 전례). */
    public static Club saveClub(ClubRepository clubRepository, ClubStatus status) {
        return saveClub(clubRepository, status, "신호동아리" + SEQUENCE.incrementAndGet());
    }

    /** 이름을 정한 동아리 — 키워드 검색·이름순 페이지 테스트용(이름은 호출 측이 유일하게 준다). */
    public static Club saveClub(ClubRepository clubRepository, ClubStatus status, String name) {
        Club club = ClubFixture.academic(name);
        ReflectionTestUtils.setField(club, "status", status);
        return clubRepository.save(club);
    }

    /** 저장 전 접수 중 모집 — endDate 가 null 이면 상시모집. stopIntake 처럼 저장 전에 도메인 전이를 거는 테스트가 쓴다. */
    public static Recruitment newOpenRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return Recruitment.createWithOptions(club, "신호모집" + SEQUENCE.incrementAndGet(), null, startDate, endDate, 10,
                ApplicationMode.SELF, null, true, TargetRole.MEMBER, null, null, false);
    }

    public static Recruitment saveOpenRecruitment(RecruitmentRepository recruitmentRepository, Club club,
                                                  LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(newOpenRecruitment(club, startDate, endDate));
    }

    /** 마감 모집 — closedAt 은 seoul regime 벽시계다(운영 코드가 now(clock) 으로 찍는다, TIMEZONE.md). */
    public static Recruitment saveClosedRecruitment(RecruitmentRepository recruitmentRepository, Club club,
                                                    LocalDate startDate, LocalDate endDate, LocalDateTime closedAt) {
        Recruitment recruitment = newOpenRecruitment(club, startDate, endDate);
        recruitment.close(closedAt);
        return recruitmentRepository.save(recruitment);
    }

    /** 마감했는데 closed_at 이 없는 레거시 행(운영 22건) — 도메인으로는 만들 수 없어 저장 뒤 jdbc 로 지운다. */
    public static void clearClosedAt(JdbcTemplate jdbcTemplate, Recruitment recruitment) {
        jdbcTemplate.update("UPDATE recruitment SET closed_at = NULL WHERE id = ?", recruitment.getId());
    }

    /** 가입 신청 시각을 옮긴다 — created_at 은 @CreatedDate(system regime)라 KST 벽시계를 저장 존 벽시계로 바꿔 넣는다. */
    public static void moveRequestedAt(JdbcTemplate jdbcTemplate, ClubJoinRequest joinRequest,
                                       LocalDateTime seoulRequestedAt) {
        jdbcTemplate.update("UPDATE club_join_request SET created_at = ? WHERE id = ?",
                Timestamp.valueOf(TimeMapper.seoulToSystemWallClock(seoulRequestedAt)), joinRequest.getId());
    }

    /** 동아리에 회원을 넣는다 — 이름은 회장 표시 회귀 테스트가 대조한다(학번은 유일). */
    public static User saveMember(UserRepository userRepository, ClubMemberRepository clubMemberRepository,
                                  Club club, ClubMemberRole role, String name) {
        User member = userRepository.save(UserFixture.withName(name));
        clubMemberRepository.save(ClubMember.of(club, member, role));
        return member;
    }

    /** 마지막 로그인 — 무클럭 now() 로 찍히는 system regime 벽시계다(TimeMapper.systemNow(clock) 기준으로 준다). */
    public static void recordLogin(JdbcTemplate jdbcTemplate, User user, LocalDateTime systemLoggedInAt) {
        jdbcTemplate.update("UPDATE users SET last_login_at = ? WHERE id = ?", Timestamp.valueOf(systemLoggedInAt), user.getId());
    }

    /** 세션 마지막 사용 — now(clock) 으로 찍히는 seoul regime 벽시계다. revoked 면 그 시각에 로그아웃으로 폐기한다. */
    public static AuthSession saveSession(AuthSessionRepository authSessionRepository, User user,
                                          LocalDateTime seoulLastUsedAt, boolean revoked) {
        AuthSession session = AuthSession.create(user.getId(), SessionPlatform.WEB, null, null, null, false,
                seoulLastUsedAt, Duration.ofDays(30));
        if (revoked) {
            session.revoke(seoulLastUsedAt, SessionRevokeReason.LOGOUT);
        }
        return authSessionRepository.save(session);
    }

    /** club_metric 행 — 신호는 last_activity_at 만 본다(나머지는 0). lastActivityAt 이 null 이면 "행은 있는데 기록 없음". */
    public static void saveMetric(ClubMetricRepository clubMetricRepository, Club club, LocalDateTime lastActivityAt) {
        clubMetricRepository.save(ClubMetric.of(club.getId(), 0, 0, lastActivityAt, 0.0, 0.0, 0, LocalDateTime.now()));
    }

    /** 탈퇴(소프트 삭제)만 찍고 멤버십은 남긴다 — 탈퇴 정리 전 잔존 멤버십 모양. */
    public static void withdraw(JdbcTemplate jdbcTemplate, User user) {
        jdbcTemplate.update("UPDATE users SET deleted_at = now() WHERE id = ?", user.getId());
    }
}
