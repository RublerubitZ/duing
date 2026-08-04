package com.duing.domain.fee.controller;

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
import com.duing.domain.clubaudit.support.AuditDetailJson;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Map;
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

/**
 * 총동연 회비 감사 로그 조회 검증(스펙 §7.8).
 *
 * <p>이벤트는 변이 API 를 거치지 않고 계측 코드와 같은 팩터리로 직접 시드한다 — 계측이 남기는지는
 * {@code FeeAuditInstrumentationTest} 소관이고, 여기서 볼 것은 쌓인 이벤트를 어떻게 잘라 내려주느냐다.
 * 저장 순서가 곧 발생 순서이며, 같은 순간에 저장돼 created_at 이 동률이어도 id 로 최신순이 갈린다.
 *
 * <p>날짜는 전부 오늘 기준 상대값이다 — 절대 날짜를 박으면 그 날이 지나는 순간 CI 가 깨진다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFeeAuditLogTest extends IntegrationTestBase {

    private static final String LOGS_PATH = "/api/v1/admin/fees/{clubId}/audit-logs";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String LEADER_NAME = "이운영";

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private String adminToken;
    private String studentToken;

    private Long auditClubId;
    private Long policyId;
    private Long billId;
    private Long paymentId;

    private Long policyUpdatedEventId;
    private Long paymentVoidedEventId;
    private Long policyDeletedEventId;
    private Long joinLinkEventId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminToken = tokenOf(adminUser);
        studentToken = tokenOf(studentUser);

        auditClubId = activeClub("감사로그동아리").getId();
        Long otherClubId = activeClub("감사비교동아리").getId();

        User leaderUser = userRepository.save(UserFixture.withName(LEADER_NAME));
        User withdrawnOfficer = userRepository.save(UserFixture.withName("탈퇴운영진"));

        LocalDate today = LocalDate.now(SEOUL);
        policyId = feePolicyRepository.save(FeePolicy.create(auditClubId, "월 회비", 20_000L,
                BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS)).getId();
        billId = feeBillRepository.save(FeeBill.issue(auditClubId, leaderUser.getId(), policyId, 20_000L,
                YearMonth.now(SEOUL).toString(), today.minusDays(30), today.minusDays(1), today)).getId();
        paymentId = paymentRepository.save(Payment.record(billId, 20_000L, PaymentMethod.TRANSFER,
                LocalDateTime.now(SEOUL), leaderUser.getId(), null)).getId();

        policyUpdatedEventId = saveEvent(ClubAuditEvent.feePolicy(
                ClubAuditEventType.FEE_POLICY_UPDATED, auditClubId, policyId, leaderUser.getId(),
                AuditDetailJson.of(Map.of("amount", Map.of("old", 10_000L, "new", 20_000L)))));
        paymentVoidedEventId = saveEvent(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_VOIDED, auditClubId, billId, paymentId, null,
                leaderUser.getId(), "중복 입금 정정", AuditDetailJson.of(Map.of("amount", 20_000L))));
        // 정책 삭제는 스냅샷 없이 기록된다(계측 원본이 detail=null) — detail 이 빈 이벤트의 직렬화도 함께 태운다.
        policyDeletedEventId = saveEvent(ClubAuditEvent.feePolicy(
                ClubAuditEventType.FEE_POLICY_DELETED, auditClubId, policyId, withdrawnOfficer.getId(), null));
        // 감사 행은 actor 가 탈퇴해도 남는다 — 이름만 해석되지 않는 상태를 재현한다.
        userRepository.delete(withdrawnOfficer);

        // 회비 밖 이벤트(가입 링크)와 다른 동아리의 회비 이벤트 — 둘 다 응답에 섞이면 안 된다.
        // 가입 링크 참조(모집·코드)는 이 검증과 무관해 비워 둔다.
        joinLinkEventId = saveEvent(ClubAuditEvent.joinLink(
                ClubAuditEventType.JOIN_LINK_CREATED, auditClubId, null, null, leaderUser.getId()));
        saveEvent(ClubAuditEvent.feeAccount(
                ClubAuditEventType.FEE_ACCOUNT_DELETED, otherClubId, leaderUser.getId(), null));
    }

    @Test
    @DisplayName("감사 로그는 최신순으로 행위자 이름과 변경 스냅샷을 붙여 내려주고 탈퇴한 행위자는 이름만 비운다")
    void auditLogsAreLatestFirstWithActorNameAndDetail() {
        JsonPath response = searchLogs();

        assertThat(response.getList("data.content.eventId", Long.class))
                .containsExactly(policyDeletedEventId, paymentVoidedEventId, policyUpdatedEventId);
        assertThat(response.getLong("data.totalElements")).isEqualTo(3L);

        assertThat(response.getString(eventPath(policyUpdatedEventId) + ".eventType"))
                .isEqualTo("FEE_POLICY_UPDATED");
        assertThat(response.getString(eventPath(policyUpdatedEventId) + ".actorName")).isEqualTo(LEADER_NAME);
        assertThat(response.getString(eventPath(policyUpdatedEventId) + ".createdAt")).isNotNull();
        assertThat(response.getLong(eventPath(policyUpdatedEventId) + ".refs.feePolicyId")).isEqualTo(policyId);
        // detail 은 문자열이 아니라 JSON 객체 그대로 내려간다 — 화면이 한 번 더 파싱하지 않아야 한다.
        assertThat(response.getLong(eventPath(policyUpdatedEventId) + ".detail.amount.old")).isEqualTo(10_000L);
        assertThat(response.getLong(eventPath(policyUpdatedEventId) + ".detail.amount.new")).isEqualTo(20_000L);

        assertThat(response.getString(eventPath(paymentVoidedEventId) + ".reason")).isEqualTo("중복 입금 정정");
        assertThat(response.getLong(eventPath(paymentVoidedEventId) + ".refs.feeBillId")).isEqualTo(billId);
        assertThat(response.getLong(eventPath(paymentVoidedEventId) + ".refs.paymentId")).isEqualTo(paymentId);
        assertThat(response.getString(eventPath(paymentVoidedEventId) + ".refs.bankTransactionId")).isNull();

        assertThat(response.getString(eventPath(policyDeletedEventId) + ".actorName"))
                .as("탈퇴한 운영진의 감사 행은 남고 이름만 비워진다")
                .isNull();
        assertThat(response.getLong(eventPath(policyDeletedEventId) + ".actorUserId")).isPositive();
        assertThat(response.getString(eventPath(policyDeletedEventId) + ".detail"))
                .as("스냅샷 없이 기록된 이벤트도 응답이 깨지지 않는다")
                .isNull();
    }

    @Test
    @DisplayName("이벤트 종류 필터는 지정한 회비 이벤트만 남기고 회비 밖 종류는 거부 대신 무시된다")
    void typeFilterKeepsRequestedFeeEventsAndIgnoresOthers() {
        JsonPath onlyVoided = searchLogs("types", "FEE_PAYMENT_VOIDED");
        assertThat(onlyVoided.getList("data.content.eventId", Long.class))
                .containsExactly(paymentVoidedEventId);

        JsonPath mixedTypes = searchLogs("types", "FEE_PAYMENT_VOIDED", "types", "JOIN_LINK_CREATED");
        assertThat(mixedTypes.getList("data.content.eventId", Long.class))
                .as("회비 밖 종류를 섞어 보내도 400 이 아니라 그 값만 빠진다")
                .containsExactly(paymentVoidedEventId);

        JsonPath nonFeeOnly = searchLogs("types", "JOIN_LINK_CREATED");
        assertThat(nonFeeOnly.getList("data.content")).isEmpty();
        assertThat(nonFeeOnly.getLong("data.totalElements")).isZero();
    }

    @Test
    @DisplayName("같은 동아리에 회비 밖 이벤트가 쌓여 있어도 감사 로그에는 실리지 않는다")
    void nonFeeEventsAreNeverListed() {
        assertThat(clubAuditEventRepository.findById(joinLinkEventId))
                .as("가입 링크 이벤트는 DB 에는 남아 있다")
                .isPresent();

        JsonPath response = searchLogs();

        assertThat(response.getList("data.content.eventId", Long.class)).doesNotContain(joinLinkEventId);
        assertThat(response.getList("data.content.eventType", String.class))
                .isNotEmpty()
                .allMatch(eventType -> eventType.startsWith("FEE_"));
    }

    @Test
    @DisplayName("기간은 이벤트 발생 시각 기준이라 어제까지로 자르면 오늘 쌓인 이력이 모두 빠진다")
    void periodFilterCutsEventsByOccurrenceTime() {
        LocalDate today = LocalDate.now(SEOUL);

        JsonPath untilYesterday = searchLogs("to", today.minusDays(1).toString());
        assertThat(untilYesterday.getList("data.content")).isEmpty();
        assertThat(untilYesterday.getLong("data.totalElements")).isZero();

        JsonPath fromToday = searchLogs("from", today.toString());
        assertThat(fromToday.getLong("data.totalElements")).isEqualTo(3L);
    }

    @Test
    @DisplayName("감사 로그는 비로그인 401·학생 403 이고 없는 동아리는 빈 목록이 아니라 404 다")
    void auditLogsRequireAdminRole() {
        RestAssured.given()
                .when().get(LOGS_PATH, auditClubId)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(LOGS_PATH, auditClubId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(LOGS_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    private JsonPath searchLogs(String... queryParams) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(LOGS_PATH, auditClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private String eventPath(Long eventId) {
        return "data.content.find { it.eventId == " + eventId + " }";
    }

    private Long saveEvent(ClubAuditEvent event) {
        return clubAuditEventRepository.save(event).getId();
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    /** ClubFixture 의 기본 상태는 승인 대기라, 감사 대상 스코프(ACTIVE)에 들도록 승격한다. */
    private Club activeClub(String name) {
        Club savedClub = clubRepository.save(ClubFixture.academic(name));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", savedClub.getId());
        return savedClub;
    }
}
