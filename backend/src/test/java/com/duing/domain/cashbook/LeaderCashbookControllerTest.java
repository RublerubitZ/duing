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
import org.springframework.jdbc.core.JdbcTemplate;

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
    @Autowired JdbcTemplate jdbcTemplate;

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
        // Club.create 기본 상태는 PENDING_APPROVAL — 장부 관리(총무 경로)는 운영 행위 게이트(Part C)로
        // ACTIVE 동아리만 허용되므로, 상태 차단 자체를 검증하는 테스트가 아닌 한 ACTIVE 로 둔다.
        jdbcTemplate.update("UPDATE club SET status = 'ACTIVE' WHERE id = ?", clubId);
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
    @DisplayName("BANK 자동 생성 항목의 금액을 수정하려 하면 400 을 반환한다")
    void rejectAmountUpdateOnBankApiEntry() {
        Long bankEntryId = insertBankApiEntry();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("categoryCode", "FEE", "amount", 50000))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + bankEntryId)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("BANK 자동 생성 항목의 카테고리·메모만 수정하면 204 를 반환한다")
    void updateCategoryAndMemoOnBankApiEntry() {
        Long bankEntryId = insertBankApiEntry();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("categoryCode", "FEE", "memo", "회비"))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + bankEntryId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        CashbookEntry updated = cashbookEntryRepository.findByIdAndClubId(bankEntryId, clubId).orElseThrow();
        assertThat(updated.getCategoryCode()).isEqualTo(CashbookCategory.FEE);
        assertThat(updated.getMemo()).isEqualTo("회비");
        assertThat(updated.getAmount()).isEqualTo(10000L);
    }

    @Test
    @DisplayName("BANK 자동 생성 항목은 삭제할 수 없다(409)")
    void rejectDeleteOnBankApiEntry() {
        Long bankEntryId = insertBankApiEntry();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/leader/clubs/" + clubId + "/cashbook/" + bankEntryId)
                .then().statusCode(HttpStatus.CONFLICT.value());

        assertThat(cashbookEntryRepository.findByIdAndClubId(bankEntryId, clubId)).isPresent();
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

    @Test
    @DisplayName("수동 항목을 집계에서 제외하면 요약(총수입)에서 빠진다")
    void excludeManualEntryDropsFromSummary() {
        CashbookEntry kept = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 100000L, LocalDate.of(2026, 9, 1)));
        CashbookEntry excluded = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.SPONSOR, 50000L, LocalDate.of(2026, 9, 2)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + excluded.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(cashbookEntryRepository.findById(excluded.getId()).orElseThrow().isExcluded()).isTrue();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook/summary")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalIncome", equalTo(100000)); // kept 만 합산, excluded 제외
        // 보존 확인: 제외해도 항목 자체는 남는다
        assertThat(cashbookEntryRepository.findById(kept.getId())).isPresent();
    }

    @Test
    @DisplayName("BANK 자동 항목도 집계에서 제외할 수 있다")
    void excludeBankApiEntry() {
        Long bankEntryId = insertBankApiEntry();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + bankEntryId + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(cashbookEntryRepository.findById(bankEntryId).orElseThrow().isExcluded()).isTrue();
    }

    @Test
    @DisplayName("hideExcluded=true 면 목록에서 제외 항목이 빠진다")
    void listHidesExcluded() {
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 100000L, LocalDate.of(2026, 9, 1)));
        CashbookEntry excluded = cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.MT, 30000L, LocalDate.of(2026, 9, 2)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + excluded.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 기본(필터 없음): 2건, excluded 필드 노출
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(2));
        // hideExcluded=true: 1건
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("hideExcluded", true)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].excluded", equalTo(false));
    }

    @Test
    @DisplayName("타 동아리 항목 제외 토글은 404, 비총무는 403")
    void exclusionIsolation() {
        CashbookEntry otherEntry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(otherClubId, CashbookCategory.FEE, 1000L, LocalDate.of(2026, 9, 1)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + otherEntry.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        CashbookEntry ourEntry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 1000L, LocalDate.of(2026, 9, 1)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + ourEntry.getId() + "/exclusion")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    // BANK_API 장부 항목은 엔티티 팩토리(createManual)로 만들 수 없어 raw INSERT 로 셋업한다.
    // chk_cashbook_bank_link 충족을 위해 bank_transaction 1행을 먼저 넣고 그 id 를 FK 로 연결한다.
    private Long insertBankApiEntry() {
        jdbcTemplate.update(
                "INSERT INTO bank_transaction "
                        + "(club_id, bank_code, transaction_at, amount, transaction_type, match_status, transaction_hash, raw_payload) "
                        + "VALUES (?, 'KB', now(), 10000, 'DEPOSIT', 'IGNORED', ?, '{}'::jsonb)",
                clubId, "hash-bank-1");
        Long bankTransactionId = jdbcTemplate.queryForObject(
                "SELECT id FROM bank_transaction WHERE transaction_hash = ?", Long.class, "hash-bank-1");

        jdbcTemplate.update(
                "INSERT INTO cashbook_entry "
                        + "(club_id, entry_type, source, category_code, amount, description, transaction_date, bank_transaction_id) "
                        + "VALUES (?, 'INCOME', 'BANK_API', 'OTHER', 10000, '입금', DATE '2026-09-01', ?)",
                clubId, bankTransactionId);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM cashbook_entry WHERE bank_transaction_id = ?", Long.class, bankTransactionId);
    }
}
