package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
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
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 총동연(ADMIN) 모집 강제 마감 검증.
 *
 * <p>강제 마감은 운영진 수동 마감과 같은 도메인 메서드({@code Recruitment.close})를 타므로
 * 종료 시각 스탬프·가입 링크 사용 가능 기간 같은 파생 규칙이 그대로 유지돼야 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminRecruitmentForceCloseTest extends IntegrationTestBase {

    private static final String CLOSE_PATH = "/api/v1/admin/recruitments/{recruitmentId}/close";
    private static final String EXTERNAL_FORM_URL = "https://forms.example.com/duing";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired TransactionTemplate transactionTemplate;
    /** 마감 시각은 프로덕션과 같은 seoulClock 으로 찍는다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 어긋난다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club alphaClub;
    private Recruitment openRecruitment;

    private User adminUser;
    private User leaderUser;
    private String adminToken;
    private String studentToken;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        leaderUser = userRepository.save(UserFixture.unique());
        adminToken = tokenOf(adminUser);
        studentToken = tokenOf(studentUser);
        leaderToken = tokenOf(leaderUser);

        alphaClub = clubRepository.save(ClubFixture.academic("알파동아리"));
        clubMemberRepository.save(ClubMember.asLeader(alphaClub, leaderUser));

        openRecruitment = saveRecruitment(alphaClub, "진행 중 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
    }

    @Test
    @DisplayName("진행 중인 모집을 강제 마감하면 종료 시각이 남고 사유가 감사 이벤트로 기록된다")
    void forceCloseStampsClosedAtAndRecordsAuditEvent() {
        forceClose(adminToken, openRecruitment.getId(), Map.of("reason", "  운영 규정 위반 신고 접수  "))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        Recruitment closed = recruitmentRepository.findById(openRecruitment.getId()).orElseThrow();
        assertThat(closed.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(closed.getClosedAt())
                .as("종료 시각은 가입 링크 사용 기간의 기준점이라 반드시 남는다").isNotNull();

        List<ClubAuditEvent> auditEvents = clubAuditEventRepository.findAll();
        assertThat(auditEvents).hasSize(1);
        ClubAuditEvent forceCloseEvent = auditEvents.getFirst();
        assertThat(forceCloseEvent.getEventType()).isEqualTo(ClubAuditEventType.RECRUITMENT_FORCE_CLOSED);
        assertThat(forceCloseEvent.getClubId()).isEqualTo(alphaClub.getId());
        assertThat(forceCloseEvent.getRecruitmentId()).isEqualTo(openRecruitment.getId());
        assertThat(forceCloseEvent.getActorUserId())
                .as("행위자는 마감을 실행한 관리자다").isEqualTo(adminUser.getId());
        assertThat(forceCloseEvent.getReason())
                .as("앞뒤 공백은 다듬어 저장한다").isEqualTo("운영 규정 위반 신고 접수");
    }

    @Test
    @DisplayName("사유 없이 강제 마감하면 마감은 그대로 이뤄지고 감사 이벤트의 사유만 비어 있다")
    void forceCloseWithoutReasonLeavesReasonEmpty() {
        forceClose(adminToken, openRecruitment.getId(), Map.of("reason", "   "))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus())
                .isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(clubAuditEventRepository.findAll().getFirst().getReason())
                .as("공백뿐인 사유는 저장하지 않는다").isNull();
    }

    @Test
    @DisplayName("사유가 500자를 넘으면 400 으로 거절되고 모집은 진행 중으로 남는다")
    void reasonLongerThanLimitIsRejected() {
        forceClose(adminToken, openRecruitment.getId(), Map.of("reason", "가".repeat(501)))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus())
                .isEqualTo(RecruitmentStatus.OPEN);
        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("이미 마감된 모집을 다시 강제 마감하면 409 로 막히고 감사 이벤트도 늘지 않는다")
    void closingAlreadyClosedRecruitmentConflicts() {
        forceClose(adminToken, openRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        forceClose(adminToken, openRecruitment.getId(), Map.of("reason", "두 번째 시도"))
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(clubAuditEventRepository.findAll())
                .as("실패한 마감은 감사 이벤트를 남기지 않는다").hasSize(1);
    }

    @Test
    @DisplayName("외부 폼 모집을 강제 마감해도 가입 가능 기간이 남은 링크는 계속 쓸 수 있다")
    void forceClosedExternalRecruitmentKeepsJoinLinkUsable() {
        Club betaClub = clubRepository.save(ClubFixture.academic("베타동아리"));
        Recruitment externalRecruitment = saveRecruitment(betaClub, "외부 폼 모집", ApplicationMode.EXTERNAL,
                LocalDate.now().minusDays(3), LocalDate.now().plusDays(7));
        clubJoinCodeRepository.save(ClubJoinCode.issue(betaClub, externalRecruitment,
                "T%05d".formatted(sequence.incrementAndGet() % 100_000), null, 10, 7, leaderUser.getId()));

        forceClose(adminToken, externalRecruitment.getId(), Map.of("reason", "행사 종료"))
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // isUsable 은 LAZY 모집 연관을 읽으므로 트랜잭션 안에서 판정한다(open-in-view=false).
        Boolean joinCodeUsable = transactionTemplate.execute(status -> clubJoinCodeRepository
                .findByRecruitmentIdAndRevokedAtIsNull(externalRecruitment.getId())
                .orElseThrow()
                .isUsable(LocalDateTime.now(clock)));
        assertThat(joinCodeUsable)
                .as("마감은 가입 기간의 시작점일 뿐이라 기간 안의 링크는 살아 있다").isTrue();
    }

    @Test
    @DisplayName("없는 모집이나 삭제된 모집을 강제 마감하면 404 를 반환한다")
    void closingMissingRecruitmentReturns404() {
        // 동아리당 진행 중 모집은 하나뿐이므로(uk_recruitment_club_active) 별도 동아리에 시드한다.
        Club gammaClub = clubRepository.save(ClubFixture.academic("감마동아리"));
        Recruitment deletedRecruitment = saveRecruitment(gammaClub, "삭제된 모집", ApplicationMode.SELF,
                LocalDate.now().minusDays(20), LocalDate.now().minusDays(10));
        recruitmentRepository.delete(deletedRecruitment);

        forceClose(adminToken, deletedRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
        forceClose(adminToken, 999_999L, Map.of())
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("관리자가 아니면 강제 마감할 수 없다 — 동아리 운영진도 전역 역할은 학생이라 막힌다")
    void nonAdminCannotForceClose() {
        forceClose(studentToken, openRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        forceClose(leaderToken, openRecruitment.getId(), Map.of())
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        assertThat(recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus())
                .isEqualTo(RecruitmentStatus.OPEN);
    }

    @Test
    @DisplayName("비로그인 상태에서는 강제 마감이 401 로 막힌다")
    void anonymousForceCloseReturns401() {
        RestAssured
                .given()
                    .contentType(ContentType.JSON)
                    .body(Map.of())
                .when()
                    .patch(CLOSE_PATH, openRecruitment.getId())
                .then()
                    .statusCode(HttpStatus.UNAUTHORIZED.value());
    }

    private Response forceClose(String token, Long recruitmentId, Map<String, ?> requestBody) {
        return RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .patch(CLOSE_PATH, recruitmentId);
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    /** 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveRecruitment(Club targetClub, String title, ApplicationMode applicationMode,
                                        LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(Recruitment.createWithOptions(targetClub, title, "내용",
                startDate, endDate, 10, applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? EXTERNAL_FORM_URL : null,
                false, TargetRole.MEMBER, null, null, false));
    }
}
