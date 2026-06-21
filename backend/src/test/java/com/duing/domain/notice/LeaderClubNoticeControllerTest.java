package com.duing.domain.notice;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeTargetClub;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.notice.repository.NoticeTargetClubRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderClubNoticeControllerTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired NoticeRepository noticeRepository;
    @Autowired NoticeTargetClubRepository targetClubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String leaderToken;
    private String officerToken;
    private String memberToken;
    private Long clubId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        Club club = clubRepository.save(Club.create("동아리A",
                ClubCategory.ACADEMIC, null, "설명", null));
        clubId = club.getId();

        User leader = saveUser();
        User officer = saveUser();
        User member = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER));

        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
        officerToken = jwtTokenProvider.createToken(officer.getId(), officer.getRole().name());
        memberToken = jwtTokenProvider.createToken(member.getId(), member.getRole().name());
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create("20" + seq, "U" + seq,
                "u" + seq + "@duing.ac.kr", "h", UserRole.STUDENT,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now()));
    }

    private Long createNoticeAs(String token, String title) {
        return RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(ContentType.JSON)
                .body(Map.of("title", title, "summary", "요약", "content", "본문",
                        "coverImageUrl", "https://example.com/cover.png"))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");
    }

    @Test
    @DisplayName("LEADER 가 공지를 생성하면 회원 피드에 노출된다")
    void createAndList() {
        Long noticeId = createNoticeAs(leaderToken, "첫 공지");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", greaterThan(0))
                .body("data.content[0].id", equalTo(noticeId.intValue()))
                .body("data.content[0].title", equalTo("첫 공지"));
    }

    @Test
    @DisplayName("OFFICER 가 공지를 수정할 수 있다")
    void officerCanUpdate() {
        Long noticeId = createNoticeAs(leaderToken, "원본");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "수정됨"))
                .when().patch("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());
    }

    @Test
    @DisplayName("OFFICER 의 삭제 시도는 403 을 반환한다")
    void officerCannotDelete() {
        Long noticeId = createNoticeAs(leaderToken, "삭제 후보");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + officerToken)
                .when().delete("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("LEADER 가 삭제하면 회원 피드에서 사라진다 (soft delete)")
    void leaderCanDelete() {
        Long noticeId = createNoticeAs(leaderToken, "삭제 대상");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalElements", equalTo(0));
    }

    @Test
    @DisplayName("MEMBER 가 작성 시도하면 403 을 반환한다")
    void memberCannotCreate() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "회원이 작성", "summary", "요약", "content", "본문",
                        "coverImageUrl", "https://example.com/cover.png"))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("pinned 공지가 최상단에 나오고 그 다음 createdAt DESC 정렬")
    void pinnedFirstThenCreatedAtDesc() {
        createNoticeAs(leaderToken, "오래된 공지");
        createNoticeAs(leaderToken, "최신 공지");
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "고정 공지", "summary", "요약", "content", "본문",
                        "coverImageUrl", "https://example.com/cover.png", "pinned", true))
                .when().post("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content[0].title", equalTo("고정 공지"))
                .body("data.content[1].title", equalTo("최신 공지"))
                .body("data.content[2].title", equalTo("오래된 공지"));
    }

    @Test
    @DisplayName("관리자가 작성한(소유 클럽 없는) 공지는 대상 클럽 LEADER 도 수정·삭제할 수 없다 (작성자 경계)")
    void leaderCannotMutateAdminAuthoredNotice() {
        // owning_club_id 없이(=createForClub 가 아닌 관리자 경로) 생성하고 대상에 이 클럽을 포함시킨다.
        // 과거 anyMatch(target==clubId) 가드는 통과시켰지만, owning_club_id 검증은 거부해야 한다.
        Long authorId = saveUser().getId();
        Notice adminNotice = noticeRepository.save(Notice.create(
                "관리자 공지", "요약", "본문", "https://example.com/c.png", null,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.ALL_MEMBERS, false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId));
        targetClubRepository.save(new NoticeTargetClub(adminNotice.getId(), clubId));
        Long noticeId = adminNotice.getId();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(Map.of("title", "변조 시도"))
                .when().patch("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().delete("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("회원이 동아리 공지 상세를 조회하면 본문과 표지를 포함해 200 을 반환한다")
    void memberCanReadDetailWithContent() {
        Long noticeId = createNoticeAs(leaderToken, "상세 공지");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.OK.value())
                .body("data.id", equalTo(noticeId.intValue()))
                .body("data.title", equalTo("상세 공지"))
                .body("data.content", equalTo("본문"))
                .body("data.coverImageUrl", equalTo("https://example.com/cover.png"));
    }

    @Test
    @DisplayName("비-회원이 동아리 공지 상세를 조회하면 403 을 반환한다")
    void nonMemberCannotReadDetail() {
        Long noticeId = createNoticeAs(leaderToken, "비밀 공지");
        User stranger = saveUser();
        String strangerToken = jwtTokenProvider.createToken(stranger.getId(), stranger.getRole().name());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + strangerToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/" + noticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("관리자가 작성한(소유 클럽 없는) 공지는 대상 클럽 네임스페이스 상세로 조회할 수 없다 (403)")
    void adminAuthoredNoticeNotReadableViaClubDetail() {
        Long authorId = saveUser().getId();
        Notice adminNotice = noticeRepository.save(Notice.create(
                "관리자 공지", "요약", "본문", "https://example.com/c.png", null,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.ALL_MEMBERS, false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId));
        targetClubRepository.save(new NoticeTargetClub(adminNotice.getId(), clubId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/" + adminNotice.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("존재하지 않는 공지 상세를 조회하면 404 를 반환한다")
    void notFoundDetailReturns404() {
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/999999")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }

    @Test
    @DisplayName("관리자가 OFFICERS_ONLY 로 전환한 동아리 작성 공지는 일반 회원이 상세 조회할 수 없다 (403)")
    void officersOnlyOwnedNoticeNotReadableByMember() {
        Long authorId = saveUser().getId();
        Notice officersNotice = Notice.create(
                "운영진 공지", "요약", "본문", "https://example.com/c.png", null,
                NoticeCategory.GENERAL, List.of(), NoticeVisibility.CLUB_SCOPED,
                NoticeClubScopeRole.OFFICERS_ONLY, false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN, authorId);
        officersNotice.assignOwningClub(clubId);
        noticeRepository.save(officersNotice);
        targetClubRepository.save(new NoticeTargetClub(officersNotice.getId(), clubId));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/" + officersNotice.getId())
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }

    @Test
    @DisplayName("다른 동아리가 작성한 공지를 현재 동아리 네임스페이스 상세로 조회하면 403 을 반환한다")
    void crossClubOwnedNoticeNotReadableViaClubDetail() {
        Club otherClub = clubRepository.save(Club.create("동아리B", ClubCategory.ACADEMIC, null, "설명", null));
        User otherLeader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(otherClub, otherLeader));
        String otherLeaderToken = jwtTokenProvider.createToken(otherLeader.getId(), otherLeader.getRole().name());

        Long otherNoticeId = RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherLeaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("title", "B 공지", "summary", "요약", "content", "본문",
                        "coverImageUrl", "https://example.com/cover.png"))
                .when().post("/api/v1/clubs/" + otherClub.getId() + "/notices")
                .then().statusCode(HttpStatus.CREATED.value())
                .extract().jsonPath().getLong("data");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .when().get("/api/v1/clubs/" + clubId + "/notices/" + otherNoticeId)
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
}
