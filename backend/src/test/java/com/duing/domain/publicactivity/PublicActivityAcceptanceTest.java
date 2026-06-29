package com.duing.domain.publicactivity;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.RestAssured;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PublicActivityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    ClubRepository clubRepository;

    @Autowired
    NoticeRepository noticeRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long authorId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // notice.author_id 는 users(id) FK 참조 — 공지 시드 전 최소 1명 생성
        long seq = sequence.incrementAndGet();
        User author = userRepository.save(User.create(
                "20" + seq, "작성자" + seq, "author" + seq + "@duing.ac.kr", "hash",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        authorId = author.getId();
    }

    @Test
    @DisplayName("비인증 GET /api/v1/public-activities 는 200 을 반환하고 Cache-Control 헤더를 포함한다")
    void unauthenticatedGetReturns200WithCacheControlHeader() {
        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", containsString("max-age=60"))
                .header("Cache-Control", containsString("public"))
                .header("Cache-Control", containsString("stale-while-revalidate=30"));
    }

    @Test
    @DisplayName("ACTIVE 동아리의 PUBLIC 공지는 NOTICE_CREATED 타입으로 피드에 노출되고 ISO 날짜 형식이다")
    void activeClubPublicNoticeAppearsInFeedWithCorrectTypeAndIsoDate() {
        Club activeClub = saveAndActivate("공개공지동아리" + sequence.incrementAndGet());
        savePublicNoticeForClub(activeClub, "공개 공지 제목");

        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                .body("data.items[0].type", equalTo("NOTICE_CREATED"))
                .body("data.items[0].clubName", equalTo(activeClub.getName()))
                .body("data.items[0].occurredAt",
                        matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z"));
    }

    @Test
    @DisplayName("PENDING 동아리 공지와 ACTIVE 동아리 비공개 공지는 피드에 노출되지 않는다")
    void pendingClubAndNonPublicNoticeAreHiddenFromFeed() {
        // PENDING_APPROVAL 상태 동아리 (ACTIVE 아님) 의 PUBLIC 공지
        Club pendingClub = clubRepository.save(
                Club.create("미승인동아리" + sequence.incrementAndGet(),
                        ClubCategory.ACADEMIC, null, "설명", null));
        savePublicNoticeForClub(pendingClub, "미승인 동아리 공지");

        // ACTIVE 동아리지만 OFFICERS_ALL 가시성 공지 (비공개)
        Club activeClub = saveAndActivate("비공개공지동아리" + sequence.incrementAndGet());
        Notice officersOnlyNotice = Notice.create(
                "임원 전용 공지", "요약", "내용", "", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.OFFICERS_ALL, null,
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN,
                authorId);
        officersOnlyNotice.assignOwningClub(activeClub.getId());
        noticeRepository.save(officersOnlyNotice);

        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.items.collect { it.clubName }",
                        not(containsString(pendingClub.getName())))
                .body("data.items.findAll { it.clubName == '" + activeClub.getName()
                        + "' && it.type == 'NOTICE_CREATED' }", hasSize(0));
    }

    @Test
    @DisplayName("limit=999 요청 시 최대 허용 limit(20)으로 클램프되어 반환된다")
    void limitIsClampedToMaxLimitOf20() {
        Club activeClub = saveAndActivate("limit테스트동아리" + sequence.incrementAndGet());

        for (int i = 0; i < 25; i++) {
            savePublicNoticeForClub(activeClub, "공지 " + i);
        }

        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=999")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.items", hasSize(20));
    }

    @Test
    @DisplayName("30일 윈도우 밖의 공지(40일 전 작성)는 피드에서 제외된다")
    void noticeOutsideWindowIsExcludedFromFeed() {
        Club activeClub = saveAndActivate("윈도우테스트동아리" + sequence.incrementAndGet());
        Notice oldNotice = savePublicNoticeForClub(activeClub, "오래된 공지");

        backdateNoticeCreatedAt(oldNotice.getId(), 40);

        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.items.findAll { it.clubName == '" + activeClub.getName() + "' }",
                        hasSize(0));
    }

    /**
     * Club.create 는 PENDING_APPROVAL 로 생성된다 — ACTIVE 로 만들려면 changeStatus 를 호출한다.
     */
    private Club saveAndActivate(String clubName) {
        Club club = Club.create(clubName, ClubCategory.ACADEMIC, null, "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        return clubRepository.save(club);
    }

    private Notice savePublicNoticeForClub(Club club, String title) {
        Notice notice = Notice.create(
                title, "요약", "내용", "", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null,
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN,
                authorId);
        notice.assignOwningClub(club.getId());
        return noticeRepository.save(notice);
    }

    void backdateNoticeCreatedAt(Long noticeId, int daysAgo) {
        jdbcTemplate.update(
                "UPDATE notice SET created_at = ? WHERE id = ?",
                LocalDateTime.now().minusDays(daysAgo),
                noticeId);
    }
}
