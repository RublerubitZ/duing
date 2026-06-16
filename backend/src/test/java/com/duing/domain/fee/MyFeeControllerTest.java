package com.duing.domain.fee;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class MyFeeControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    UserRepository userRepository;
    @Autowired
    ClubRepository clubRepository;
    @Autowired
    ClubMemberRepository clubMemberRepository;
    @Autowired
    FeePolicyRepository feePolicyRepository;
    @Autowired
    FeeBillRepository feeBillRepository;
    @Autowired
    JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long clubId;
    private Long otherClubId;
    private Long policyId;
    private Long otherPolicyId;
    private User userA;
    private User userB;
    private String tokenA;
    private String tokenB;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리A", ClubCategory.ACADEMIC, null, "설명", null));
        Club otherClub = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();
        otherClubId = otherClub.getId();

        userA = saveUser();
        userB = saveUser();
        clubMemberRepository.save(ClubMember.asMember(club, userA));
        clubMemberRepository.save(ClubMember.asMember(club, userB));

        FeePolicy policy = feePolicyRepository.save(FeePolicy.create(clubId, "회비", 10000L, BillingType.MONTHLY));
        FeePolicy otherPolicy = feePolicyRepository.save(
                FeePolicy.create(otherClubId, "회비", 20000L, BillingType.MONTHLY));
        policyId = policy.getId();
        otherPolicyId = otherPolicy.getId();

        tokenA = jwtTokenProvider.createToken(userA.getId(), userA.getRole().name());
        tokenB = jwtTokenProvider.createToken(userB.getId(), userB.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private void saveBill(Long clubIdValue, Long policyIdValue, Long userId, String period, FeeStatus status) {
        // billingStartDate 를 "YYYY-MM" 회차에서 파생해 (fee_policy_id, user_id, billing_start_date) 유니크
        // 인덱스가 회차별로 달라지게 한다(같은 회원의 여러 회차 저장 시 충돌 방지).
        LocalDate start = LocalDate.parse(period + "-01");
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        FeeBill bill = FeeBill.issue(clubIdValue, userId, policyIdValue, 10000L, period, start, end, end);
        if (status == FeeStatus.CANCELLED) {
            bill.cancel();
        }
        feeBillRepository.save(bill);
    }

    @Test
    @DisplayName("내 회비 조회는 본인 user_id 의 청구만 반환한다")
    void myFeesOnlyOwn() {
        // 회원별로 회차 라벨을 구분(A=07/08, B=09)해 응답에 타인 청구가 섞이지 않음을 라벨로 검증한다.
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, policyId, userA.getId(), "2026-08", FeeStatus.PENDING);
        // 다른 회원(B) 청구는 A 조회에서 제외돼야 한다
        saveBill(clubId, policyId, userB.getId(), "2026-09", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                // A 의 회차만 보이고 B 의 "2026-09" 는 절대 포함되지 않는다
                .body("data.billingPeriod", everyItem(not(equalTo("2026-09"))))
                .body("data.billingPeriod", containsInAnyOrder("2026-07", "2026-08"));
    }

    @Test
    @DisplayName("다른 회원의 청구는 본인 조회에 절대 노출되지 않는다")
    void otherMembersBillsExcluded() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);  // A 의 청구
        saveBill(clubId, policyId, userB.getId(), "2026-08", FeeStatus.PENDING);  // B 의 청구
        saveBill(clubId, policyId, userB.getId(), "2026-09", FeeStatus.PENDING);  // B 의 청구

        // B 토큰으로 조회하면 B 의 2건만, A 의 "2026-07" 은 보이지 않는다
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenB)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(2))
                .body("data.billingPeriod", everyItem(not(equalTo("2026-07"))))
                .body("data.billingPeriod", containsInAnyOrder("2026-08", "2026-09"));
    }

    @Test
    @DisplayName("내 회비 조회는 clubId 옵션 필터로 해당 동아리 청구만 반환한다")
    void filterByClubId() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(otherClubId, otherPolicyId, userA.getId(), "2026-07", FeeStatus.PENDING);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("clubId", clubId)
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].clubId", equalTo(clubId.intValue()));
    }

    @Test
    @DisplayName("내 회비 조회는 status 옵션 필터로 해당 상태 청구만 반환한다")
    void filterByStatus() {
        saveBill(clubId, policyId, userA.getId(), "2026-07", FeeStatus.PENDING);
        saveBill(clubId, policyId, userA.getId(), "2026-08", FeeStatus.CANCELLED);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenA)
                .queryParam("status", "PENDING")
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].status", equalTo("PENDING"));
    }

    @Test
    @DisplayName("인증 없이 내 회비를 조회하면 401 을 반환한다")
    void unauthenticatedRejected() {
        RestAssured.given()
                .when().get("/api/v1/my/fees")
                .then().statusCode(HttpStatus.UNAUTHORIZED.value());
    }
}
