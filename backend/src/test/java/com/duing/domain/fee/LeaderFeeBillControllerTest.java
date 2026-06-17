package com.duing.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

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
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
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
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@Import({TestcontainersConfiguration.class, LeaderFeeBillControllerTest.FixedClockConfig.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderFeeBillControllerTest extends IntegrationTestBase {

    // 발행일(오늘)을 2026-06-15(Asia/Seoul)로 고정해 due_date 기본 산출·과거 검증을 결정적으로 만든다.
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    @TestConfiguration
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock fixedClock() {
            return Clock.fixed(
                    TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
                    ZoneId.of("Asia/Seoul"));
        }
    }

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
    JdbcTemplate jdbcTemplate;
    @Autowired
    TransactionTemplate transactionTemplate;

    private String leaderToken;
    private String memberToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        clubId = club.getId();

        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    /** clubId 동아리에 활성 회원 count 명을 추가로 만든다(setUp 의 leader+member 와 별개). */
    private List<Long> addActiveMembers(int count) {
        Club club = clubRepository.findById(clubId).orElseThrow();
        List<Long> userIds = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            User user = userRepository.save(UserFixture.unique());
            clubMemberRepository.save(ClubMember.asMember(club, user));
            userIds.add(user.getId());
        }
        return userIds;
    }

    private FeePolicy savePolicy(BillingType billingType, long amount) {
        return feePolicyRepository.save(FeePolicyFixture.of(clubId, billingType, amount));
    }

    private FeePolicy saveInactivePolicy() {
        return feePolicyRepository.save(FeePolicyFixture.inactive(clubId));
    }

    private Map<String, Object> monthlyBody(String billingPeriod) {
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", billingPeriod);
        return body;
    }

    private Response generateAs(String token, Long policyId, Map<String, Object> body) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies/" + policyId + "/bills");
    }

    private long countBills(Long policyId) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_bill WHERE fee_policy_id = ? AND status <> 'CANCELLED' AND deleted_at IS NULL",
                Long.class, policyId);
        return count == null ? 0L : count;
    }

    @Test
    @DisplayName("동일 정책·회차로 두 번 발행하면 두 번째는 created 0, skipped N 이다")
    void idempotentGenerate() {
        addActiveMembers(2); // setUp 의 활성 2명 + 2명 = 4명
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);

        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(4))
                .body("data.skipped", equalTo(0));

        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(0))
                .body("data.skipped", equalTo(4));

        assertThat(countBills(policy.getId())).isEqualTo(4L);
    }

    @Test
    @DisplayName("탈퇴(soft delete)한 회원은 청구 대상에서 제외된다")
    void excludesDeletedMembers() {
        List<Long> added = addActiveMembers(2); // 활성 leader+member+2 = 4명
        // 추가 멤버 1명을 soft delete → 활성 3명
        ClubMember target = clubMemberRepository.findByClubIdAndUserId(clubId, added.get(0)).orElseThrow();
        clubMemberRepository.delete(target);

        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);

        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(3))
                .body("data.skipped", equalTo(0));
    }

    @Test
    @DisplayName("취소한 청구는 같은 회원·회차로 재발행할 수 있다")
    void reissueAfterCancel() {
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L); // 활성 2명(leader+member)

        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2));

        // 발행된 청구 한 건을 취소 → CANCELLED
        FeeBill bill = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId()))
                .findFirst().orElseThrow();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 재발행 → 취소건은 멱등 제약에서 제외되므로 그 회원에게 다시 1건 발행
        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(1));

        // 활성(취소 아님) 청구는 2건(원래 1건 유지 + 재발행 1건)
        assertThat(countBills(policy.getId())).isEqualTo(2L);
    }

    @Test
    @DisplayName("이미 취소된 청구를 다시 취소해도 204(멱등 no-op)이다")
    void cancelIsIdempotent() {
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);
        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value());
        FeeBill bill = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId()))
                .findFirst().orElseThrow();

        for (int attempt = 0; attempt < 2; attempt++) {
            RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .when().delete("/api/v1/leader/clubs/" + clubId + "/fee-bills/" + bill.getId())
                    .then().statusCode(HttpStatus.NO_CONTENT.value());
        }
        assertThat(feeBillRepository.findById(bill.getId()).orElseThrow().getStatus())
                .isEqualTo(FeeStatus.CANCELLED);
    }

    @Test
    @DisplayName("비활성 정책으로 청구하면 409 를 반환한다")
    void inactivePolicyConflict() {
        FeePolicy policy = saveInactivePolicy();
        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("일반 멤버가 청구를 발행하면 403 을 반환한다")
    void memberForbidden() {
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);
        generateAs(memberToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 정책으로 청구하면 404 를 반환한다")
    void policyNotFound() {
        generateAs(leaderToken, 999999L, monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("정책 금액 변경 후 재발행해도 기존 청구액은 불변이고, 다음 회차는 새 금액으로 발행된다")
    void amountSnapshot() {
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);

        generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2));

        // 정책 금액을 12000 으로 변경
        FeePolicy reloaded = feePolicyRepository.findById(policy.getId()).orElseThrow();
        reloaded.update(null, 12000L, null, null);
        feePolicyRepository.saveAndFlush(reloaded);

        // 기존 회차(2026-07) 청구액은 10000 로 불변
        List<FeeBill> julyBills = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId())
                        && candidate.getBillingPeriod().equals("2026-07"))
                .toList();
        assertThat(julyBills).isNotEmpty();
        assertThat(julyBills).allMatch(candidate -> candidate.getAmount() == 10000L);

        // 다음 회차(2026-08) 발행은 새 금액 12000 으로 스냅샷
        generateAs(leaderToken, policy.getId(), monthlyBody("2026-08"))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2));
        List<FeeBill> augustBills = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId())
                        && candidate.getBillingPeriod().equals("2026-08"))
                .toList();
        assertThat(augustBills).isNotEmpty();
        assertThat(augustBills).allMatch(candidate -> candidate.getAmount() == 12000L);
    }

    @Test
    @DisplayName("활성 회원이 0명인 club 에 발행하면 created=0 skipped=0 이다")
    void zeroMembers() {
        // HTTP 발행은 actor 가 requireManager 를 통과해야 하고 매니저 본인도 활성 회원이라
        // '활성 0명' 은 HTTP 경로로는 도달 불가능하다. 발행 SQL(bulkInsertBills) 자체를
        // 멤버가 전혀 없는 club 에 직접 실행해 created=0·skipped=0(클램프) 산출을 검증한다(Sprint 2 cron 경로).
        Club emptyClub = clubRepository.save(ClubFixture.academic("빈 동아리"));
        FeePolicy policy = feePolicyRepository.save(
                FeePolicyFixture.of(emptyClub.getId(), BillingType.MONTHLY, 10000L));

        int created = transactionTemplate.execute(status -> feeBillRepository.bulkInsertBills(
                emptyClub.getId(), policy.getId(), 10000L, "2026-07",
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31), LocalDate.of(2026, 7, 31)));
        long activeCount = clubMemberRepository.countActiveByClubId(emptyClub.getId());
        int skipped = (int) Math.max(0L, activeCount - created);

        assertThat(created).isZero();
        assertThat(skipped).isZero();
        assertThat(countBills(policy.getId())).isZero();
    }

    @Test
    @DisplayName("활성 회원이 매니저 1명뿐인 동아리 발행은 created=1 skipped=0 이다")
    void onlyManagerMember() {
        // 활성 회원이 매니저 1명뿐이면 created=1·skipped=0 (DB INSERT...SELECT 가 활성 회원 전원 대상)
        Club soloClub = clubRepository.save(ClubFixture.academic("1인 동아리"));
        User soloManager = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(soloClub, soloManager));
        String token = jwtTokenProvider.createToken(soloManager.getId(), soloManager.getRole().name());
        FeePolicy policy = feePolicyRepository.save(
                FeePolicyFixture.of(soloClub.getId(), BillingType.MONTHLY, 10000L));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(monthlyBody("2026-07"))
                .when().post("/api/v1/leader/clubs/" + soloClub.getId() + "/fee-policies/" + policy.getId() + "/bills")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(1))
                .body("data.skipped", equalTo(0));
    }

    @Test
    @DisplayName("연중 연회비(YEARLY) 발행은 기본 마감이 발행일 이후라 201 로 통과한다")
    void yearlyMidYearDefaultDueNotPast() {
        FeePolicy policy = savePolicy(BillingType.YEARLY, 50000L);
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", "2026"); // 발행일 2026-06-15 → 기본 마감 = 발행월 말일 2026-06-30 (과거 아님)

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.CREATED.value());

        FeeBill bill = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId()))
                .findFirst().orElseThrow();
        assertThat(bill.getDueDate()).isEqualTo(LocalDate.of(2026, 6, 30));
        assertThat(bill.getBillingStartDate()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(bill.getBillingEndDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    }

    @Test
    @DisplayName("운영자가 발행일보다 과거인 마감일을 명시하면 400 code=DUE_DATE_IN_PAST 이다")
    void overridePastDueRejected() {
        FeePolicy policy = savePolicy(BillingType.YEARLY, 50000L);
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", "2026");
        body.put("dueDate", "2026-06-10"); // 발행일(2026-06-15) 이전 → DUE_DATE_IN_PAST. start(2026-01-01) 이후라 BEFORE_PERIOD 는 아님

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("DUE_DATE_IN_PAST"));
    }

    @Test
    @DisplayName("마감일이 청구 기간 시작일보다 앞서면 400 code=DUE_DATE_BEFORE_PERIOD 이다")
    void dueBeforePeriodRejected() {
        FeePolicy policy = savePolicy(BillingType.SEMESTER, 30000L);
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", "2026-2학기");
        body.put("billingStartDate", "2026-09-01");
        body.put("billingEndDate", "2026-12-31");
        body.put("dueDate", "2026-08-15"); // start(2026-09-01) 보다 앞 → DUE_DATE_BEFORE_PERIOD

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.BAD_REQUEST.value())
                .body("code", equalTo("DUE_DATE_BEFORE_PERIOD"));
    }

    @Test
    @DisplayName("ONE_TIME 은 과거 행사·과거 마감일을 명시해도 사후 기록으로 허용된다")
    void oneTimePastEventAllowed() {
        FeePolicy policy = savePolicy(BillingType.ONE_TIME, 20000L);
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", "신입생 MT 참가비");
        body.put("billingStartDate", "2026-03-01"); // 발행일(2026-06-15) 이전 행사
        body.put("billingEndDate", "2026-03-01");
        body.put("dueDate", "2026-03-10");           // 과거 마감 — ONE_TIME 면제(§5.1-3)

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2));
    }

    @Test
    @DisplayName("같은 정책·회차를 10개 스레드가 동시에 발행해도 청구는 회원 수만큼만 생성된다")
    void concurrentGenerateIsIdempotent() throws Exception {
        addActiveMembers(98); // setUp 활성 2명(leader+member) + 98명 = 100명
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);

        int threadCount = 10;
        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<int[]>> futures = new ArrayList<>();

        for (int index = 0; index < threadCount; index++) {
            futures.add(pool.submit(() -> {
                barrier.await(); // 모든 스레드가 동시에 POST 하도록 정렬 → 실제 경합 유발
                Response response = generateAs(leaderToken, policy.getId(), monthlyBody("2026-07"));
                int statusCode = response.statusCode();
                int created = response.jsonPath().getInt("data.created");
                int skipped = response.jsonPath().getInt("data.skipped");
                return new int[]{statusCode, created, skipped};
            }));
        }

        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

        int totalCreated = 0;
        int totalSkipped = 0;
        for (Future<int[]> future : futures) {
            int[] outcome = future.get(); // silent 예외(스레드 내부 실패) 표면화
            assertThat(outcome[0]).isEqualTo(HttpStatus.CREATED.value()); // 모든 응답 2xx(409 0건)
            totalCreated += outcome[1];
            totalSkipped += outcome[2];
        }

        // ① fee_bill 정확히 100건
        assertThat(countBills(policy.getId())).isEqualTo(100L);
        // ② created 합 100 · skipped 합 900
        assertThat(totalCreated).isEqualTo(100);
        assertThat(totalSkipped).isEqualTo(900);
        // ③ distinct user_id 100
        Long distinctUsers = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT user_id) FROM fee_bill WHERE fee_policy_id = ? AND status <> 'CANCELLED'",
                Long.class, policy.getId());
        assertThat(distinctUsers).isEqualTo(100L);
    }

    @Test
    @DisplayName("취소 후 동시 재발행해도 활성 청구는 1건만 생성된다")
    void concurrentReissueAfterCancel() throws Exception {
        // 활성 회원 1명(member)만 두기 위해 setUp 의 leader 멤버십은 매니저로 유지하되,
        // 매니저(leader)도 활성 회원이므로 대상은 leader+member 2명. 단순화를 위해 1인 동아리로 재구성한다.
        Club soloClub = clubRepository.save(ClubFixture.academic("재발행 동아리"));
        User soloManager = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(soloClub, soloManager));
        String token = jwtTokenProvider.createToken(soloManager.getId(), soloManager.getRole().name());
        FeePolicy policy = feePolicyRepository.save(
                FeePolicyFixture.of(soloClub.getId(), BillingType.MONTHLY, 10000L));

        // 1건 발행 → cancel
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(monthlyBody("2026-07"))
                .when().post("/api/v1/leader/clubs/" + soloClub.getId() + "/fee-policies/" + policy.getId() + "/bills")
                .then().statusCode(HttpStatus.CREATED.value()).body("data.created", equalTo(1));
        FeeBill bill = feeBillRepository.findAll().stream()
                .filter(candidate -> candidate.getFeePolicyId().equals(policy.getId()))
                .findFirst().orElseThrow();
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .when().delete("/api/v1/leader/clubs/" + soloClub.getId() + "/fee-bills/" + bill.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 10 스레드 동시 재발행 → 활성 청구는 정확히 1건만 (취소 1건 + 활성 1건)
        int threadCount = 10;
        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int index = 0; index < threadCount; index++) {
            futures.add(pool.submit(() -> {
                barrier.await();
                Response response = RestAssured.given()
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                        .contentType(ContentType.JSON)
                        .body(monthlyBody("2026-07"))
                        .when().post("/api/v1/leader/clubs/" + soloClub.getId()
                                + "/fee-policies/" + policy.getId() + "/bills");
                return response.statusCode();
            }));
        }
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();
        for (Future<Integer> future : futures) {
            assertThat(future.get()).isEqualTo(HttpStatus.CREATED.value());
        }

        Long activeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM fee_bill WHERE fee_policy_id = ? AND status <> 'CANCELLED' AND deleted_at IS NULL",
                Long.class, policy.getId());
        assertThat(activeCount).isEqualTo(1L);
    }

    @Test
    @DisplayName("취소와 재발행을 같은 회차로 동시에 실행해도 청구가 영구 소실되지 않는다")
    void concurrentCancelAndReissueNeverLosesCharge() throws Exception {
        // cancel() 이 정책 락 없이 dirty update 만 하면, 진행 중 취소 + 동시 재발행이 서로 비껴가
        // (재발행의 ON CONFLICT DO NOTHING 이 곧 취소될 PENDING 행을 보고 created=0 → 그 뒤 취소 커밋)
        // 활성 청구가 0건이 되는 lost-charge 경합이 가능하다. Fix 1(정책 비관적 락으로 cancel·generate 직렬화).
        //
        // 주의: 직렬화 후에도 lock 획득 순서가 generate-first 면 (created=0 → 이후 취소) 0건이 되는 것은
        // 정당한 직렬 결과다. 즉 '동시 쌍 직후 활성 수' 자체로는 pre/post-fix 가 구분되지 않으므로
        // (양쪽 모두 {0,1}) 이 테스트는 회귀 재현이 아니라 가드다: 어떤 인터리빙에서도 (1) 예외·데드락
        // 없이 두 작업이 완료되고 (2) 활성 청구 ≤ 1 이며 (3) 단발 재발행이 항상 정확히 1건으로 복구
        // (= 청구는 영구 소실되지 않는다) 함을 여러 라운드 반복으로 검증한다.
        // 단일 사용자(1인 동아리)로 (policy,user,period) 를 한 키로 고정해 결정적으로 만든다.
        Club soloClub = clubRepository.save(ClubFixture.academic("동시 취소·재발행 동아리"));
        User soloManager = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(soloClub, soloManager));
        String token = jwtTokenProvider.createToken(soloManager.getId(), soloManager.getRole().name());
        FeePolicy policy = feePolicyRepository.save(
                FeePolicyFixture.of(soloClub.getId(), BillingType.MONTHLY, 10000L));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            int rounds = 30; // 경합 창을 여러 번 두드려 인터리빙을 끌어낸다(직렬화 시 항상 불변식 유지).
            for (int round = 0; round < rounds; round++) {
                // 라운드 시작: 활성 청구 정확히 1건 보장.
                reissueOne(token, soloClub.getId(), policy.getId());
                Long activeBillId = activeBillId(policy.getId());
                assertThat(activeBillId).isNotNull();

                // 취소 + 재발행을 동시에 실행.
                CyclicBarrier barrier = new CyclicBarrier(2);
                Future<Integer> cancelFuture = pool.submit(() -> {
                    barrier.await();
                    return RestAssured.given()
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                            .when().delete("/api/v1/leader/clubs/" + soloClub.getId()
                                    + "/fee-bills/" + activeBillId)
                            .statusCode();
                });
                Future<Integer> reissueFuture = pool.submit(() -> {
                    barrier.await();
                    return RestAssured.given()
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                            .contentType(ContentType.JSON)
                            .body(monthlyBody("2026-07"))
                            .when().post("/api/v1/leader/clubs/" + soloClub.getId()
                                    + "/fee-policies/" + policy.getId() + "/bills")
                            .statusCode();
                });
                assertThat(cancelFuture.get(30, TimeUnit.SECONDS)).isEqualTo(HttpStatus.NO_CONTENT.value());
                assertThat(reissueFuture.get(30, TimeUnit.SECONDS)).isEqualTo(HttpStatus.CREATED.value());

                // 직렬화 불변식: 어떤 인터리빙이든 활성(非CANCELLED) 청구는 0건 또는 1건(부분 유니크 인덱스가 ≤1 보장).
                long active = countBills(policy.getId());
                assertThat(active).isLessThanOrEqualTo(1L);

                // 청구는 영구 소실되지 않는다: 단발 재발행이 항상 정확히 1건으로 복구한다.
                reissueOne(token, soloClub.getId(), policy.getId());
                assertThat(countBills(policy.getId())).isEqualTo(1L);
            }
        } finally {
            pool.shutdownNow();
            assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        }
    }

    /** soloClub 의 policy 로 단발 재발행해 활성 청구를 정확히 1건으로 맞춘다(이미 1건이면 created=0 멱등). */
    private void reissueOne(String token, Long soloClubId, Long policyId) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(monthlyBody("2026-07"))
                .when().post("/api/v1/leader/clubs/" + soloClubId + "/fee-policies/" + policyId + "/bills")
                .then().statusCode(HttpStatus.CREATED.value());
    }

    /** policy 의 활성(非CANCELLED, 미삭제) 청구 id 한 건을 반환한다(없으면 null). */
    private Long activeBillId(Long policyId) {
        List<Long> ids = jdbcTemplate.queryForList(
                "SELECT id FROM fee_bill WHERE fee_policy_id = ? AND status <> 'CANCELLED' AND deleted_at IS NULL",
                Long.class, policyId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    @Test
    @DisplayName("정책 락 없이 동일 회차로 동시 INSERT 해도 부분 유니크 인덱스가 회원 수만큼만 삽입한다")
    void concurrentBulkInsertRespectsPartialUniqueIndex() throws Exception {
        // 위 HTTP 동시성 테스트는 fee_policy 비관적 잠금이 generate() 호출을 직렬화하므로 커밋된 행과의
        // ON CONFLICT 만 검증한다. 여기서는 정책 잠금을 우회하고 bulkInsertBills 를 N 스레드가 '동시에'
        // 같은 (policy, billing_start_date) 로 INSERT 해 진짜 동시 삽입 경합을 부분 유니크 인덱스가
        // 중재하는지(uk_fee_bill_idem + ON CONFLICT DO NOTHING) 검증한다. ON CONFLICT 절을 제거하면
        // 동시 INSERT 가 23505 로 깨져 Future.get 에서 표면화된다.
        addActiveMembers(48); // setUp 활성 2명 + 48명 = 50명
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L);
        LocalDate start = LocalDate.of(2026, 7, 1);
        LocalDate end = LocalDate.of(2026, 7, 31);

        int threadCount = 10;
        CyclicBarrier barrier = new CyclicBarrier(threadCount);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        List<Future<Integer>> futures = new ArrayList<>();
        for (int index = 0; index < threadCount; index++) {
            futures.add(pool.submit(() -> {
                barrier.await(); // 10개 트랜잭션이 동시에 같은 키로 INSERT 진입 → 진짜 동시 삽입 경합
                return transactionTemplate.execute(status -> feeBillRepository.bulkInsertBills(
                        clubId, policy.getId(), 10000L, "2026-07", start, end, end));
            }));
        }
        pool.shutdown();
        assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

        int totalCreated = 0;
        for (Future<Integer> future : futures) {
            totalCreated += future.get(); // 23505(ON CONFLICT 제거 회귀) 시 여기서 예외 표면화
        }
        // 동시 삽입이어도 합산 created == 회원 수, 실제 행도 회원 수(중복 삽입 0)
        assertThat(totalCreated).isEqualTo(50);
        assertThat(countBills(policy.getId())).isEqualTo(50L);
        Long distinctUsers = jdbcTemplate.queryForObject(
                "SELECT COUNT(DISTINCT user_id) FROM fee_bill WHERE fee_policy_id = ? AND status <> 'CANCELLED'",
                Long.class, policy.getId());
        assertThat(distinctUsers).isEqualTo(50L);
    }
}
