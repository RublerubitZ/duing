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
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.UserService;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
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
 * 총동연 회비 감사 목록·대시보드·상세 KPI 검증.
 *
 * <p>날짜는 전부 오늘 기준 상대값이다 — 절대 날짜를 박으면 그 날이 지나는 순간 CI 가 깨진다.
 * 연체 판정은 저장된 status 가 아니라 마감일 파생이라, 연체 케이스도 status 는 PENDING 인 채로 시드한다
 * (OverdueBillJob 이 돌지 않은 상태를 그대로 재현).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminFeeAuditClubsTest extends IntegrationTestBase {

    private static final String LIST_PATH = "/api/v1/admin/fees";
    private static final String DASHBOARD_PATH = "/api/v1/admin/fees/dashboard";
    private static final String DETAIL_PATH = "/api/v1/admin/fees/{clubId}";
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired FeePolicyRepository feePolicyRepository;
    @Autowired FeeBillRepository feeBillRepository;
    @Autowired PaymentRepository paymentRepository;
    @Autowired ClubAuditEventRepository clubAuditEventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired UserService userService;

    private String adminToken;
    private String studentToken;
    private Long adminUserId;

    private Long alphaClubId;
    private Long betaClubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;

        User adminUser = userRepository.save(UserFixture.admin());
        User studentUser = userRepository.save(UserFixture.unique());
        adminUserId = adminUser.getId();
        adminToken = tokenOf(adminUser);
        studentToken = tokenOf(studentUser);

        LocalDate today = LocalDate.now(SEOUL);

        // 알파: 정책 1개(활성) + 회원 2명. 청구 3건 중 1건 취소, 납부 2건 중 1건 정정.
        Club alphaClub = activeClub("감사알파동아리");
        alphaClubId = alphaClub.getId();
        User alphaMember = userRepository.save(UserFixture.unique());
        User alphaUnpaidMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(alphaClub, alphaMember));
        clubMemberRepository.save(ClubMember.asMember(alphaClub, alphaUnpaidMember));
        // 탈퇴 회원은 회원 수·미납 인원 어디에도 섞이면 안 된다 — 서비스 경로(withdraw)로 탈퇴시켜 멤버십 soft-delete 를 함께 탄다.
        User alphaWithdrawnMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(alphaClub, alphaWithdrawnMember));
        userService.withdraw(alphaWithdrawnMember.getId());

        Long alphaPolicyId = saveActivePolicy(alphaClubId);
        FeeBill paidBill = saveBill(alphaClubId, alphaMember.getId(), alphaPolicyId, 10_000L,
                today.minusDays(40), today.minusDays(10), FeeStatus.PAID);
        FeeBill unpaidBill = saveBill(alphaClubId, alphaUnpaidMember.getId(), alphaPolicyId, 20_000L,
                today.minusDays(40), today.plusDays(10), FeeStatus.PENDING);
        saveBill(alphaClubId, alphaMember.getId(), alphaPolicyId, 5_000L,
                today.minusDays(70), today.minusDays(40), FeeStatus.CANCELLED);
        saveActivePayment(paidBill.getId(), 10_000L, alphaMember.getId());
        saveVoidedPayment(unpaidBill.getId(), 20_000L, alphaUnpaidMember.getId());

        // 베타: 활성 정책 없음(비활성 정책만) + 회원 1명이 미납 청구 2건 — 하나는 마감 경과.
        Club betaClub = activeClub("감사베타동아리");
        betaClubId = betaClub.getId();
        User betaMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(betaClub, betaMember));

        Long betaPolicyId = saveInactivePolicy(betaClubId);
        saveBill(betaClubId, betaMember.getId(), betaPolicyId, 10_000L,
                today.minusDays(60), today.minusDays(1), FeeStatus.PENDING);
        saveBill(betaClubId, betaMember.getId(), betaPolicyId, 10_000L,
                today.minusDays(30), today.plusDays(5), FeeStatus.PENDING);
    }

    @Test
    @DisplayName("회비 감사 목록은 비로그인 401·학생 403 이고 총동연만 200 으로 조회한다")
    void feeAuditListRequiresAdminRole() {
        RestAssured.given()
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(LIST_PATH)
                .then().statusCode(HttpStatus.OK.value());
    }

    @Test
    @DisplayName("목록 집계는 취소된 청구와 정정된 납부를 빼고 미수금을 계산한다")
    void listAggregationExcludesCancelledBillsAndVoidedPayments() {
        JsonPath response = searchClubs("q", "감사알파동아리");

        assertThat(response.getList("data.content")).hasSize(1);
        assertThat(response.getLong("data.content[0].clubId")).isEqualTo(alphaClubId);
        assertThat(response.getString("data.content[0].clubStatus")).isEqualTo("ACTIVE");
        assertThat(response.getBoolean("data.content[0].feeUsing")).isTrue();
        assertThat(response.getLong("data.content[0].activePolicyCount")).isEqualTo(1L);
        assertThat(response.getLong("data.content[0].memberCount")).isEqualTo(2L);
        // 취소 청구 5,000 은 건수·금액 모두에서 빠진다.
        assertThat(response.getLong("data.content[0].billCount")).isEqualTo(2L);
        assertThat(response.getLong("data.content[0].totalBilled")).isEqualTo(30_000L);
        // 정정된 납부 20,000 은 수납액에서 빠진다.
        assertThat(response.getLong("data.content[0].totalPaid")).isEqualTo(10_000L);
        assertThat(response.getLong("data.content[0].outstanding")).isEqualTo(20_000L);
        assertThat(response.getString("data.content[0].lastPaidAt")).isNotNull();
    }

    @Test
    @DisplayName("동아리명 검색어의 앞뒤 공백은 매칭을 막지 않는다")
    void clubSearchIgnoresSurroundingWhitespace() {
        JsonPath response = searchClubs("q", "  감사알파동아리  ");

        assertThat(response.getList("data.content.clubId", Long.class)).containsExactly(alphaClubId);
    }

    @Test
    @DisplayName("한 회원이 미납 청구를 여러 건 가지고 있어도 미납 인원은 1명으로 집계된다")
    void unpaidMemberCountIsDistinctByMember() {
        JsonPath response = searchClubs("q", "감사베타동아리");

        assertThat(response.getLong("data.content[0].billCount")).isEqualTo(2L);
        assertThat(response.getLong("data.content[0].unpaidMemberCount")).isEqualTo(1L);
        // 활성 정책은 없지만 청구 이력이 있어 회비 사용 동아리로 판정된다.
        assertThat(response.getLong("data.content[0].activePolicyCount")).isZero();
        assertThat(response.getBoolean("data.content[0].feeUsing")).isTrue();
    }

    @Test
    @DisplayName("기간은 청구 발행일 기준이라 어제 발행된 청구는 오늘부터 조회하면 집계에서 빠진다")
    void periodFilterCutsBillsByIssuedDate() {
        LocalDate today = LocalDate.now(SEOUL);
        backdateBillsByOneDay(betaClubId);

        JsonPath fromToday = searchClubs("q", "감사베타동아리", "from", today.toString());
        assertThat(fromToday.getLong("data.content[0].billCount")).isZero();
        assertThat(fromToday.getLong("data.content[0].totalBilled")).isZero();
        assertThat(fromToday.getLong("data.content[0].unpaidMemberCount")).isZero();

        JsonPath fromYesterday = searchClubs("q", "감사베타동아리", "from", today.minusDays(1).toString());
        assertThat(fromYesterday.getLong("data.content[0].billCount")).isEqualTo(2L);
        assertThat(fromYesterday.getLong("data.content[0].totalBilled")).isEqualTo(20_000L);
    }

    @Test
    @DisplayName("상세 진입은 열람 감사를 1건 남기고, 마감이 지난 PENDING 청구를 연체로 분류한다")
    void clubDetailRecordsViewAuditAndDerivesOverdueFromDueDate() {
        JsonPath response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(DETAIL_PATH, betaClubId)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getLong("data.clubId")).isEqualTo(betaClubId);
        assertThat(response.getLong("data.memberCount")).isEqualTo(1L);
        assertThat(response.getLong("data.billCount")).isEqualTo(2L);
        assertThat(response.getLong("data.paidCount")).isZero();
        // 마감 전 1건은 미납, 마감이 지난 1건은 연체 — 저장된 status 는 둘 다 PENDING 이다.
        assertThat(response.getLong("data.unpaidCount")).isEqualTo(1L);
        assertThat(response.getLong("data.overdueCount")).isEqualTo(1L);
        assertThat(response.getLong("data.cancelledCount")).isZero();
        assertThat(response.getLong("data.outstanding")).isEqualTo(20_000L);
        assertThat(response.getDouble("data.collectionRate")).isZero();
        assertThat(response.getBoolean("data.bankMatchingActive")).isFalse();
        assertThat(feeBillRepository.findAll())
                .as("연체 분류는 파생 계산이라 DB status 를 바꾸지 않는다")
                .allMatch(bill -> bill.getStatus() != FeeStatus.OVERDUE);

        List<ClubAuditEvent> viewEvents = clubAuditEventRepository.findAll().stream()
                .filter(event -> event.getEventType() == ClubAuditEventType.FEE_ADMIN_DETAIL_VIEWED)
                .toList();
        assertThat(viewEvents).hasSize(1);
        assertThat(viewEvents.getFirst().getClubId()).isEqualTo(betaClubId);
        assertThat(viewEvents.getFirst().getActorUserId()).isEqualTo(adminUserId);
    }

    @Test
    @DisplayName("전체 현황은 두 동아리 합계와 수납률을 반환한다")
    void dashboardSumsEveryClub() {
        JsonPath response = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(DASHBOARD_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();

        assertThat(response.getLong("data.clubCount")).isEqualTo(2L);
        assertThat(response.getLong("data.feeUsingClubCount")).isEqualTo(2L);
        assertThat(response.getLong("data.totalBilled")).isEqualTo(50_000L);
        assertThat(response.getLong("data.totalPaid")).isEqualTo(10_000L);
        assertThat(response.getLong("data.totalOutstanding")).isEqualTo(40_000L);
        assertThat(response.getDouble("data.collectionRate")).isEqualTo(20.0);
    }

    @Test
    @DisplayName("존재하지 않는 동아리의 상세를 조회하면 404 이고 열람 감사도 남지 않는다")
    void missingClubDetailReturnsNotFound() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get(DETAIL_PATH, 999_999L)
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        assertThat(clubAuditEventRepository.findAll()).isEmpty();
    }

    private JsonPath searchClubs(String... queryParams) {
        var request = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        for (int index = 0; index < queryParams.length; index += 2) {
            request = request.queryParam(queryParams[index], queryParams[index + 1]);
        }
        return request.when().get(LIST_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().jsonPath();
    }

    private String tokenOf(User user) {
        return jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    /** ClubFixture 의 기본 상태는 승인 대기라, 목록 스코프(ACTIVE·INACTIVE)에 들도록 승격한다. */
    private Club activeClub(String name) {
        Club savedClub = clubRepository.save(ClubFixture.academic(name));
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", savedClub.getId());
        return savedClub;
    }

    private Long saveActivePolicy(Long clubId) {
        return feePolicyRepository.save(FeePolicy.create(clubId, "월 회비", 10_000L,
                BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS)).getId();
    }

    private Long saveInactivePolicy(Long clubId) {
        FeePolicy policy = FeePolicy.create(clubId, "지난 학기 회비", 10_000L,
                BillingType.SEMESTER, FeeTargetType.ALL_MEMBERS);
        policy.update(null, null, null, false);
        return feePolicyRepository.save(policy).getId();
    }

    private FeeBill saveBill(Long clubId, Long userId, Long policyId, long amount,
                             LocalDate billingStartDate, LocalDate dueDate, FeeStatus status) {
        FeeBill bill = FeeBill.issue(clubId, userId, policyId, amount, billingStartDate.toString(),
                billingStartDate, billingStartDate.plusDays(29), dueDate);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        } else {
            bill.updateStatus(status);
        }
        return feeBillRepository.save(bill);
    }

    private void saveActivePayment(Long feeBillId, long amount, Long recordedBy) {
        paymentRepository.save(Payment.record(feeBillId, amount, PaymentMethod.TRANSFER,
                Instant.now(), recordedBy, null));
    }

    private void saveVoidedPayment(Long feeBillId, long amount, Long recordedBy) {
        Payment payment = Payment.record(feeBillId, amount, PaymentMethod.TRANSFER,
                Instant.now(), recordedBy, null);
        payment.voidPayment(recordedBy, "중복 입금 정정", Instant.now());
        paymentRepository.save(payment);
    }

    /**
     * created_at 은 JPA 감사 필드라 시드 시점(현재)으로 박힌다. 기간 경계를 검증하려면 뒤로 밀어야 하는데,
     * 이 컬럼은 JVM 존 벽시계 규약이므로 존을 지정하지 않은 now() 로 계산해야 조회 경계와 규약이 맞는다.
     */
    private void backdateBillsByOneDay(Long clubId) {
        jdbcTemplate.update("UPDATE fee_bill SET created_at = ? WHERE club_id = ?",
                Timestamp.valueOf(LocalDateTime.now().minusDays(1)), clubId);
    }
}
