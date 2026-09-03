package com.duing.domain.user.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthWithdrawalTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("탈퇴하면 204 를 반환하고 계정이 soft delete 된다")
    void withdrawSoftDeletesAccount() {
        User user = saveUser();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(user))
                .when().delete("/api/v1/users/me")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // @SQLRestriction 으로 JPA 조회에서 숨겨지므로 deleted_at 을 직접 확인한다.
        Timestamp deletedAt = jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM users WHERE id = ?", Timestamp.class, user.getId());
        assertThat(deletedAt).isNotNull();
    }

    @Test
    @DisplayName("탈퇴 후 같은 토큰의 후속 요청은 401 이 된다")
    void withdrawnTokenIsRejected() {
        User user = saveUser();
        String token = tokenFor(user);

        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().delete("/api/v1/users/me")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // soft-delete + token_version bump 로 같은 토큰의 인증이 차단된다.
        RestAssured.given().header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().get("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("인증 없이 탈퇴 요청은 401 을 반환한다")
    void anonymousWithdrawRejected() {
        RestAssured.given()
                .when().delete("/api/v1/users/me")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    @Test
    @DisplayName("동아리 회장은 인계 전 탈퇴하면 409 로 막힌다")
    void leaderCannotWithdrawBeforeSuccession() throws Exception {
        User leader = saveUser();
        Club club = saveActiveClub("탈퇴테스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(leader))
                .when().delete("/api/v1/users/me")
                .then().statusCode(HttpStatus.CONFLICT.value());

        // 409 면 멤버십·이력 모두 손대지 않는다(트랜잭션 원자성).
        Integer leaderActiveRows = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM club_member WHERE user_id = ? AND deleted_at IS NULL",
                Integer.class, leader.getId());
        assertThat(leaderActiveRows).isEqualTo(1);
        Integer leaderHistoryRows = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM club_member_history WHERE target_user_id = ?",
                Integer.class, leader.getId());
        assertThat(leaderHistoryRows).isZero();
    }

    @Test
    @DisplayName("탈퇴하면 소속 멤버십이 LEFT 이력과 함께 soft-delete 되어 활성 회원 수에서 빠진다")
    void withdrawSoftDeletesMembershipsWithHistory() throws Exception {
        Club firstClub = saveActiveClub("첫동아리");
        Club secondClub = saveActiveClub("둘째동아리");
        User firstLeader = saveUser();
        User secondLeader = saveUser();
        User member = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(firstClub, firstLeader));
        clubMemberRepository.save(ClubMember.asLeader(secondClub, secondLeader));
        clubMemberRepository.save(ClubMember.of(firstClub, member, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(secondClub, member, ClubMemberRole.OFFICER));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor(member))
                .when().delete("/api/v1/users/me")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(clubMemberRepository.countActiveByClubId(firstClub.getId())).isEqualTo(1L);
        assertThat(clubMemberRepository.countActiveByClubId(secondClub.getId())).isEqualTo(1L);
        // 행은 deleted_at 이 찍힌 채 남는다(가입 이력 보존) — @SQLRestriction 을 우회하는 jdbc 로 확인.
        Integer softDeletedRows = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM club_member WHERE user_id = ? AND deleted_at IS NOT NULL",
                Integer.class, member.getId());
        assertThat(softDeletedRows).isEqualTo(2);
        assertThat(clubMemberRepository.findClubMemberUserIdsIncludingDeleted(
                firstClub.getId(), List.of(member.getId()))).containsExactly(member.getId());
        List<Map<String, Object>> historyRows = jdbcTemplate.queryForList(
                "SELECT club_id, event_type, from_role, reason FROM club_member_history "
                        + "WHERE target_user_id = ? ORDER BY club_id", member.getId());
        assertThat(historyRows).hasSize(2);
        assertThat(historyRows).allSatisfy(row -> {
            assertThat(row.get("event_type")).isEqualTo("LEFT");
            assertThat(row.get("reason")).isEqualTo("회원 탈퇴");
        });
        assertThat(historyRows.get(0).get("from_role")).isEqualTo("MEMBER");
        assertThat(historyRows.get(1).get("from_role")).isEqualTo("OFFICER");
    }

    private User saveUser() {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                "탈퇴테스터",
                "hashed",
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private String tokenFor(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name(), user.getTokenVersion());
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
