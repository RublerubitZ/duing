package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;

/**
 * 공개 API 마이크로 캐시의 실효성·안전성 인수 테스트.
 *
 * <p>"캐시가 동작한다"를 응답 본문이 아니라 <b>실제 실행된 JDBC 문장 수</b>로 확인한다 — 본문만 보면
 * 캐시 없이 매번 DB 를 조회해도 통과해 회귀 가드가 공허해진다. 이 캐시가 노리는 절감이 정확히
 * "DB 왕복 제거"이므로 문장 수가 유일하게 의미 있는 지표다.
 *
 * <p>엔트리별 TTL 은 테스트 도중 자동 만료가 끼어들지 않도록 길게 두고, 만료 후 동작은 리셋용
 * {@link PublicApiCacheConfig#evictAll()} 을 직접 불러 검증한다(대기 없이 결정적).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "duing.public-api-cache.enabled=true",
                "duing.public-api-cache.ttl-ms=600000",
                "spring.jpa.properties.hibernate.generate_statistics=true"
        })
class PublicApiMicroCacheAcceptanceTest extends IntegrationTestBase {

    private static final String CLUB_LIST_PATH = "/api/v1/clubs?size=10";
    private static final int CONCURRENT_CALLERS = 20;

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired CacheManager cacheManager;
    @Autowired PublicApiCacheConfig publicApiCacheConfig;
    @Autowired EntityManagerFactory entityManagerFactory;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String studentToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // 앞선 테스트가 남긴 엔트리는 DB 를 비운 뒤에도 살아 있어 다음 테스트를 오염시킨다.
        publicApiCacheConfig.evictAll();
        User student = userRepository.save(UserFixture.withName("캐시학생"));
        studentToken = jwtTokenProvider.createToken(student.getId(), student.getRole().name());
    }

    @Test
    @DisplayName("같은 URL 을 다시 조회하면 DB 문장을 하나도 실행하지 않고 첫 응답과 동일한 본문을 돌려준다")
    void repeatedIdenticalRequestIsServedWithoutAnyDatabaseStatement() throws Exception {
        saveActiveClub("캐시동아리");

        long statementsBefore = statements();
        String firstBody = getPublicClubList();
        long firstRequestStatements = statements() - statementsBefore;

        statementsBefore = statements();
        String secondBody = getPublicClubList();
        long secondRequestStatements = statements() - statementsBefore;

        // 목록 1회 = 건수 count + 목록 select + 대표 모집 배치 조회
        assertThat(firstRequestStatements).isEqualTo(3);
        assertThat(secondRequestStatements).isZero();
        assertThat(secondBody).isEqualTo(firstBody);
    }

    @Test
    @DisplayName("인증 요청도 비인증 요청과 같은 공유 엔트리를 쓰고, 개인화된 찜 필터는 캐시를 타지도 오염시키지도 않는다")
    void authenticatedAndAnonymousShareEntryWhileFavoriteFilterStaysUncached() throws Exception {
        Club favoritedClub = saveActiveClub("찜한동아리");
        Club notFavoritedClub = saveActiveClub("안찜한동아리");
        addFavorite(favoritedClub.getId());

        String anonymousBody = getPublicClubList();

        // 인증 헤더가 붙어도 응답이 요청자와 무관하므로 같은 엔트리를 그대로 쓴다.
        // 남는 1문장은 JwtAuthenticationFilter 의 사용자 조회다 — 목록 조회 3문장은 캐시가 걷어낸다.
        long statementsBefore = statements();
        String authenticatedBody = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get(CLUB_LIST_PATH)
                .then().statusCode(HttpStatus.OK.value())
                .extract().asString();
        assertThat(statements() - statementsBefore).isEqualTo(1);
        assertThat(authenticatedBody).isEqualTo(anonymousBody);

        // 찜 필터는 사용자별 결과 — 매번 DB 를 조회해야 하고 공유 엔트리와 섞이면 안 된다.
        statementsBefore = statements();
        String favoriteBody = requestFavoriteOnlyList();
        assertThat(statements() - statementsBefore).isPositive();
        assertThat(favoriteBody).contains(favoritedClub.getName());
        assertThat(favoriteBody).doesNotContain(notFavoritedClub.getName());

        statementsBefore = statements();
        requestFavoriteOnlyList();
        assertThat(statements() - statementsBefore).isPositive();

        // 개인화 응답이 공유 엔트리를 덮어쓰지 않았음을 확인한다.
        statementsBefore = statements();
        assertThat(getPublicClubList()).isEqualTo(anonymousBody);
        assertThat(statements() - statementsBefore).isZero();
    }

    @Test
    @DisplayName("쿼리 파라미터가 다르면 다른 캐시 엔트리로 분리된다")
    void differentQueryParametersUseSeparateEntries() throws Exception {
        saveActiveClub("파라미터동아리");

        long statementsBefore = statements();
        getPublicBody("/api/v1/clubs?size=10&keyword=파라미터");
        assertThat(statements() - statementsBefore).isPositive();

        // 앞선 요청의 엔트리로 응답하면 안 된다 — 조건이 달라졌으므로 DB 를 다시 조회해야 한다.
        statementsBefore = statements();
        getPublicBody("/api/v1/clubs?size=10&keyword=다른키워드");
        assertThat(statements() - statementsBefore).isPositive();

        statementsBefore = statements();
        getPublicBody("/api/v1/clubs?size=10&keyword=파라미터");
        assertThat(statements() - statementsBefore).isZero();
    }

    @Test
    @DisplayName("TTL 이 지나 캐시가 비워지면 다음 조회는 다시 DB 에서 읽는다")
    void requestAfterTtlEvictionReadsFromDatabaseAgain() throws Exception {
        saveActiveClub("만료동아리");
        getPublicClubList();

        publicApiCacheConfig.evictAll();

        long statementsBefore = statements();
        getPublicClubList();
        assertThat(statements() - statementsBefore).isPositive();
    }

    @Test
    @DisplayName("같은 달 모집 달력을 다시 조회하면 DB 문장 없이 첫 응답과 동일한 본문을 돌려주고, 비움 후에는 다시 DB 를 읽는다")
    void repeatedCalendarRequestIsServedWithoutAnyDatabaseStatement() throws Exception {
        Club calendarClub = saveActiveClub("달력동아리");
        recruitmentRepository.save(Recruitment.create(
                calendarClub, "달력모집", null, LocalDate.now().minusDays(3), LocalDate.now().plusDays(7), 10));
        String calendarPath = "/api/v1/recruitments?yearMonth=" + YearMonth.from(LocalDate.now());

        // 달력 1회 = projection 단일 select (P0-3).
        long statementsBefore = statements();
        String firstBody = getPublicBody(calendarPath);
        assertThat(statements() - statementsBefore).isEqualTo(1);
        assertThat(firstBody).contains("달력모집");

        statementsBefore = statements();
        String secondBody = getPublicBody(calendarPath);
        assertThat(statements() - statementsBefore).isZero();
        assertThat(secondBody).isEqualTo(firstBody);

        publicApiCacheConfig.evictAll();
        statementsBefore = statements();
        getPublicBody(calendarPath);
        assertThat(statements() - statementsBefore).isPositive();
    }

    @Test
    @DisplayName("같은 URL 로 동시에 도착한 요청들은 DB 조회 한 번으로 병합되고 모두 같은 본문을 받는다")
    void concurrentIdenticalRequestsAreCoalescedIntoOneLoad() throws Exception {
        saveActiveClub("동시요청동아리");

        long statementsBefore = statements();
        List<String> bodies = new ArrayList<>();
        ExecutorService callers = Executors.newFixedThreadPool(CONCURRENT_CALLERS);
        try {
            List<Future<String>> responses = new ArrayList<>();
            for (int callerIndex = 0; callerIndex < CONCURRENT_CALLERS; callerIndex++) {
                responses.add(callers.submit(this::getPublicClubList));
            }
            for (Future<String> response : responses) {
                bodies.add(response.get(30, TimeUnit.SECONDS));
            }
        } finally {
            callers.shutdownNow();
        }

        // 캐시가 비워진 상태에서 시작하므로 첫 도착만 로더를 돈다(count + 목록 + 대표 모집 = 3문장).
        // 병합이 없으면 뒤이은 miss 들이 그대로 DB 로 가 증분이 3을 넘는다 — 이게 매분 스탬피드의 정체였다.
        assertThat(statements() - statementsBefore).isEqualTo(3);
        assertThat(bodies).hasSize(CONCURRENT_CALLERS);
        assertThat(bodies.stream().distinct().toList()).hasSize(1);
    }

    @Test
    @DisplayName("공개 목록·모집 달력 캐시만 등록되고 개인화 API 용 캐시는 존재하지 않는다")
    void onlyThePublicCachesAreRegistered() {
        assertThat(cacheManager.getCacheNames())
                .containsExactlyInAnyOrder(
                        PublicApiCacheConfig.CLUB_SEARCH_CACHE,
                        PublicApiCacheConfig.RECRUITMENT_CALENDAR_CACHE);
    }

    private String getPublicClubList() {
        return getPublicBody(CLUB_LIST_PATH);
    }

    private String getPublicBody(String path) {
        return RestAssured.given()
                .when().get(path)
                .then().statusCode(HttpStatus.OK.value())
                .extract().asString();
    }

    private String requestFavoriteOnlyList() {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().get("/api/v1/clubs?size=10&favorite=true")
                .then().statusCode(HttpStatus.OK.value())
                .extract().asString();
    }

    private void addFavorite(Long clubId) {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken)
                .when().post("/api/v1/me/favorites/{clubId}", clubId)
                .then().statusCode(HttpStatus.CREATED.value());
    }

    private long statements() {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        assertThat(statistics.isStatisticsEnabled()).isTrue();
        return statistics.getPrepareStatementCount();
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
