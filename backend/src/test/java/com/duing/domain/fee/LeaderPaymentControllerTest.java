package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.FixedClockConfig;
import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.FeePolicyFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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

// '오늘'을 FixedClockConfig.TODAY(2026-06-15 Asia/Seoul)로 고정해 마감 경과(OVERDUE) 판정을 결정적으로 만든다.
@Import({TestcontainersConfiguration.class, FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderPaymentControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    PaymentRepository paymentRepository;
    @Autowired
    JdbcTemplate jdbcTemplate;

    private String leaderToken;
    private String memberToken;
    private Long clubId;
    private Long memberUserId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();
        // Club.create 기본 상태는 PENDING_APPROVAL — 납부 기록·정정(총무 경로)은 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        memberUserId = member.getId();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    /** "YYYY-MM" 회차로 청구 1건을 발행한다(마감일은 회차 말일). */
    private FeeBill saveBill(long amount, String period) {
        FeePolicy policy = feePolicyRepository.save(FeePolicyFixture.of(clubId, BillingType.MONTHLY, amount));
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return feeBillRepository.save(
                FeeBill.issue(clubId, memberUserId, policy.getId(), amount, period, start, end, end));
    }

    private Map<String, Object> paymentBody(long amount, String method, String paidAt) {
        Map<String, Object> body = new HashMap<>();
        body.put("amount", amount);
        body.put("method", method);
        body.put("paidAt", paidAt);
        return body;
    }

    private Response recordAs(String token, Long billId, Map<String, Object> body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + billId + "/payments");
    }

    private Response voidAs(String token, Long billId, Long paymentId, String reason) {
        Map<String, Object> body = new HashMap<>();
        if (reason != null) {
            body.put("reason", reason);
        }
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId
                        + "/fee-bills/" + billId + "/payments/" + paymentId + "/void");
    }

    private FeeStatus billStatus(Long billId) {
        return feeBillRepository.findById(billId).orElseThrow().getStatus();
    }

    @Test
    @DisplayName("미납액보다 적은 금액을 납부하면 청구가 PARTIAL_PAID 로 전이한다")
    void partialPaymentTransitionsToPartialPaid() {
        FeeBill bill = saveBill(10000L, "2026-07"); // 마감 2026-07-31 (오늘 2026-06-15 이전 아님)

        recordAs(leaderToken, bill.getId(), paymentBody(4000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.CREATED.value());

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PARTIAL_PAID);
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(4000L);
    }

    @Test
    @DisplayName("분할로 두 번 납부해 남은 금액을 모두 채우면 청구가 PAID 로 전이한다")
    void splitPaymentsReachPaid() {
        FeeBill bill = saveBill(10000L, "2026-07");

        recordAs(leaderToken, bill.getId(), paymentBody(6000L, "TRANSFER", "2026-06-10"))
                .then().statusCode(HttpStatus.CREATED.value());
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PARTIAL_PAID);

        recordAs(leaderToken, bill.getId(), paymentBody(4000L, "CASH", "2026-06-12"))
                .then().statusCode(HttpStatus.CREATED.value());

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(10000L);
    }

    @Test
    @DisplayName("마감이 지난 청구에 부분 납부하면 청구가 OVERDUE 로 유지된다")
    void partialPaymentOnPastDueStaysOverdue() {
        // 마감 2026-05-31 < 오늘 2026-06-15 → 부분 납부여도 OVERDUE
        FeeBill bill = saveBill(10000L, "2026-05");

        recordAs(leaderToken, bill.getId(), paymentBody(3000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.CREATED.value());

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.OVERDUE);
    }

    @Test
    @DisplayName("남은 미납액을 초과하는 금액을 납부하면 400 을 반환한다")
    void exceedsRemainingRejected() {
        FeeBill bill = saveBill(10000L, "2026-07");

        recordAs(leaderToken, bill.getId(), paymentBody(15000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PENDING);
    }

    @Test
    @DisplayName("취소(CANCELLED)된 청구에 납부를 기록하면 409 를 반환한다")
    void cannotRecordOnCancelledBill() {
        FeeBill bill = saveBill(10000L, "2026-07");
        FeeBill cancelled = feeBillRepository.findById(bill.getId()).orElseThrow();
        cancelled.cancel();
        feeBillRepository.saveAndFlush(cancelled);

        recordAs(leaderToken, bill.getId(), paymentBody(5000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("수동 납부 기록에 method=AUTO_MATCHED 를 사용하면 400 을 반환한다")
    void autoMatchedMethodRejected() {
        FeeBill bill = saveBill(10000L, "2026-07");

        recordAs(leaderToken, bill.getId(), paymentBody(5000L, "AUTO_MATCHED", "2026-06-10"))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());

        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
    }

    @Test
    @DisplayName("납부를 정정(VOID)하면 합계·상태가 재계산되고 내역 조회에 VOIDED 로 보존 노출된다")
    void voidRecalculatesAndPreservesHistory() {
        FeeBill bill = saveBill(10000L, "2026-07");
        Response recorded = recordAs(leaderToken, bill.getId(), paymentBody(10000L, "CASH", "2026-06-10"));
        recorded.then().statusCode(HttpStatus.CREATED.value());
        Long paymentId = recorded.jsonPath().getLong("data");
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);

        voidAs(leaderToken, bill.getId(), paymentId, "오입금 정정")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 활성 합계 0 → 상태 PENDING(마감 미경과) 으로 재계산
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PENDING);

        // 내역 조회에는 VOID 된 기록이 보존 노출(VOIDED + 사유)
        Response payments = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId() + "/payments");
        payments.then().statusCode(HttpStatus.OK.value());
        List<Map<String, Object>> rows = payments.jsonPath().getList("data");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).get("status")).isEqualTo(PaymentStatus.VOIDED.name());
        assertThat(rows.get(0).get("voidReason")).isEqualTo("오입금 정정");
    }

    @Test
    @DisplayName("이미 정정(VOID)된 납부를 다시 정정해도 멱등이라 상태가 변하지 않는다")
    void voidIsIdempotent() {
        FeeBill bill = saveBill(10000L, "2026-07");
        Response recorded = recordAs(leaderToken, bill.getId(), paymentBody(5000L, "CASH", "2026-06-10"));
        Long paymentId = recorded.jsonPath().getLong("data");

        voidAs(leaderToken, bill.getId(), paymentId, "1차 정정")
                .then().statusCode(HttpStatus.NO_CONTENT.value());
        voidAs(leaderToken, bill.getId(), paymentId, "2차 정정")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 멱등 no-op: 사유는 최초 정정값으로 보존, 상태도 불변
        assertThat(paymentRepository.findById(paymentId).orElseThrow().getStatus())
                .isEqualTo(PaymentStatus.VOIDED);
        assertThat(paymentRepository.findById(paymentId).orElseThrow().getVoidReason()).isEqualTo("1차 정정");
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isZero();
    }

    @Test
    @DisplayName("일반 멤버가 납부를 기록하거나 정정하면 403 을 반환한다")
    void memberForbidden() {
        FeeBill bill = saveBill(10000L, "2026-07");
        // 매니저가 먼저 기록해 정정 대상 payment 를 만든다.
        Long paymentId = recordAs(leaderToken, bill.getId(), paymentBody(3000L, "CASH", "2026-06-10"))
                .jsonPath().getLong("data");

        recordAs(memberToken, bill.getId(), paymentBody(1000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
        voidAs(memberToken, bill.getId(), paymentId, "사유")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리의 청구에 납부를 기록하면 404 를 반환한다")
    void crossClubBillNotFound() {
        // clubId 의 매니저(leader)가 다른 동아리에 속한 청구에 접근하면 404(매니저 검증은 통과해야 도달).
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        User otherMember = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(otherClub, otherMember));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicyFixture.of(otherClub.getId(), BillingType.MONTHLY, 10000L));
        FeeBill otherBill = feeBillRepository.save(FeeBill.issue(
                otherClub.getId(), otherMember.getId(), otherPolicy.getId(), 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31)));

        // clubId 경로로 otherBill 을 기록 시도 → findByIdAndClubIdForUpdate 매칭 실패 → 404
        recordAs(leaderToken, otherBill.getId(), paymentBody(1000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("완납 시 납부 완료 알림이 청구 대상 회원에게 생성된다")
    void paymentConfirmedNotificationCreated() {
        FeeBill bill = saveBill(10000L, "2026-07");

        recordAs(leaderToken, bill.getId(), paymentBody(10000L, "CASH", "2026-06-10"))
                .then().statusCode(HttpStatus.CREATED.value());

        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification WHERE user_id = ? AND type = 'FEE_PAID_CONFIRMED'",
                Long.class, memberUserId);
        assertThat(count).isEqualTo(1L);
    }

    @Test
    @DisplayName("같은 청구에 여러 스레드가 동시에 분할 납부해도 합계·상태가 일관되며 미납액을 초과하지 않는다")
    void concurrentPaymentsAreConsistent() throws Exception {
        int threadCount = 10;
        long share = 1000L;
        long total = share * threadCount; // 10000 = 청구액과 정확히 일치
        FeeBill bill = saveBill(total, "2026-07");

        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int index = 0; index < threadCount; index++) {
            futures.add(pool.submit(() -> {
                barrier.await(); // 모든 스레드가 동시에 같은 청구에 납부 → 비관적 잠금 직렬화 검증
                Response response = recordAs(leaderToken, bill.getId(),
                        paymentBody(share, "CASH", "2026-06-10"));
                return response.statusCode();
            }));
        }
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

        // 모든 납부가 201(어떤 스레드도 미납액 초과로 막히지 않음 = 직렬화로 mid-race 초과 없음)
        for (Future<Integer> future : futures) {
            assertThat(future.get()).isEqualTo(HttpStatus.CREATED.value());
        }

        // 활성 합계 == 청구액, 상태 PAID, payment 행 정확히 10건
        assertThat(paymentRepository.sumActiveByFeeBillId(bill.getId())).isEqualTo(total);
        assertThat(billStatus(bill.getId())).isEqualTo(FeeStatus.PAID);
        Long paymentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payment WHERE fee_bill_id = ? AND status = 'ACTIVE'",
                Long.class, bill.getId());
        assertThat(paymentCount).isEqualTo((long) threadCount);
    }

    @Test
    @DisplayName("초과 분할 납부가 동시에 몰려도 활성 합계는 청구액을 넘지 않고 일부는 400으로 막힌다")
    void concurrentOverpaymentNeverExceedsRemaining() throws Exception {
        // 청구액 10000 에 10 스레드가 각 3000 동시 납부 → 잠금이 있으면 최대 3건만 성공(9000),
        // 나머지는 미납액 초과로 400. 잠금이 없으면 여러 스레드가 같은 stale sum 을 읽어 합계가
        // 10000 을 초과(oversubscription)하므로 마지막 단언이 깨진다 → lock 회귀 감지.
        int threadCount = 10;
        long share = 3000L;
        FeeBill bill = saveBill(10000L, "2026-07");

        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int index = 0; index < threadCount; index++) {
            futures.add(pool.submit(() -> {
                barrier.await();
                return recordAs(leaderToken, bill.getId(), paymentBody(share, "CASH", "2026-06-10"))
                        .statusCode();
            }));
        }
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

        int success = 0;
        int rejected = 0;
        for (Future<Integer> future : futures) {
            int statusCode = future.get();
            if (statusCode == HttpStatus.CREATED.value()) {
                success++;
            } else if (statusCode == HttpStatus.BAD_REQUEST.value()) {
                rejected++;
            } else {
                throw new AssertionError("예상치 못한 응답 코드: " + statusCode);
            }
        }

        // 성공은 정확히 3건(3000*3=9000 ≤ 10000, 4번째는 미납액 1000 < 3000 으로 막힘), 나머지 7건은 400.
        assertThat(success).isEqualTo(3);
        assertThat(rejected).isEqualTo(7);
        // 핵심 불변식: 활성 합계는 절대 청구액을 초과하지 않는다.
        long activeSum = paymentRepository.sumActiveByFeeBillId(bill.getId());
        assertThat(activeSum).isEqualTo(9000L);
        assertThat(activeSum).isLessThanOrEqualTo(bill.getAmount());
    }
}
