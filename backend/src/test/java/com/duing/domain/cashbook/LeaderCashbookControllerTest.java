package com.duing.domain.cashbook;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.CashbookEntryFixture;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.repository.CashbookEntryRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.time.LocalDate;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderCashbookControllerTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired CashbookEntryRepository cashbookEntryRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private Long clubId;
    private Long otherClubId;
    private String leaderToken;
    private String memberToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(ClubFixture.academic("동아리A"));
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        clubId = club.getId();
        otherClubId = otherClub.getId();
        User leader = userRepository.save(UserFixture.unique());
        User member = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    @Test
    @DisplayName("수동 수입/지출 항목을 등록하면 저장된다")
    void createManualEntry() {
        Integer id = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("entryType", "INCOME", "categoryCode", "FEE", "amount", 100000,
                        "description", "회비 입금", "transactionDate", "2026-09-01"))
                .when().post("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().path("data");

        CashbookEntry saved = cashbookEntryRepository.findById(id.longValue()).orElseThrow();
        assertThat(saved.getEntryType().name()).isEqualTo("INCOME");
        assertThat(saved.getCategoryCode()).isEqualTo(CashbookCategory.FEE);
        assertThat(saved.getAmount()).isEqualTo(100000L);
    }

    @Test
    @DisplayName("수입 유형에 지출 카테고리를 쓰면 400 을 반환한다")
    void invalidCategoryForType() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("entryType", "INCOME", "categoryCode", "DINING", "amount", 1000,
                        "description", "x", "transactionDate", "2026-09-01"))
                .when().post("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("기타가 아닌데 직접입력 카테고리를 보내면 400 을 반환한다")
    void customCategoryOnNonOther() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("entryType", "EXPENSE", "categoryCode", "MT", "customCategory", "현수막",
                        "amount", 1000, "description", "x", "transactionDate", "2026-09-01"))
                .when().post("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("유형·카테고리·검색 필터로 장부를 조회한다")
    void searchEntries() {
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 100000L, LocalDate.of(2026, 9, 1)));
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.DINING, 30000L, LocalDate.of(2026, 9, 3)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("entryType", "EXPENSE")
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].categoryCode", equalTo("DINING"));
    }

    @Test
    @DisplayName("요약은 총수입·총지출·장부 잔액을 반환한다(soft-delete 제외)")
    void summary() {
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 1200000L, LocalDate.of(2026, 9, 1)));
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.MT, 700000L, LocalDate.of(2026, 9, 3)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook/summary")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalIncome", equalTo(1200000))
                .body("data.totalExpense", equalTo(700000))
                .body("data.bookBalance", equalTo(500000));
    }

    @Test
    @DisplayName("수동 항목의 카테고리·금액을 수정할 수 있다")
    void updateManualEntry() {
        CashbookEntry entry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.MT, 30000L, LocalDate.of(2026, 9, 3)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("categoryCode", "DINING", "amount", 35000, "description", "회식비",
                        "transactionDate", "2026-09-04"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + entry.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        CashbookEntry updated = cashbookEntryRepository.findById(entry.getId()).orElseThrow();
        assertThat(updated.getCategoryCode()).isEqualTo(CashbookCategory.DINING);
        assertThat(updated.getAmount()).isEqualTo(35000L);
    }

    @Test
    @DisplayName("수동 항목을 삭제하면 장부에서 제외된다")
    void deleteManualEntry() {
        CashbookEntry entry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.MT, 30000L, LocalDate.of(2026, 9, 3)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/cashbook/" + entry.getId())
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(cashbookEntryRepository.findById(entry.getId())).isEmpty();
    }

    @Test
    @DisplayName("타 동아리 항목 조회·비총무 접근은 격리된다")
    void isolation() {
        CashbookEntry otherEntry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(otherClubId, CashbookCategory.FEE, 1000L, LocalDate.of(2026, 9, 1)));

        // 타 동아리 항목 삭제 → 404(우리 동아리에 없음)
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/cashbook/" + otherEntry.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        // 비총무(MEMBER) 조회 → 403
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}
