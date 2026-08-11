package com.duing.domain.recruitment.controller;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.response.ValidatableResponse;
import java.lang.reflect.Field;
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

/**
 * 외부 폼(EXTERNAL) 모집 생성의 HTTP 계약 (스펙 §2·§3).
 *
 * <p>URL 검증이 DTO 의 단순 프리픽스 @Pattern 에서 화이트리스트로 옮겨갔으므로, 실제 요청이
 * 400 으로 떨어지는지·안내 문구가 응답에 실리는지를 컨트롤러·예외 핸들러까지 통과시켜 확인한다.
 * javascript: 같은 위험 스킴 거부가 @Pattern 제거 뒤에도 유지되는지도 함께 잠근다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ExternalRecruitmentConstraintsIntegrationTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ClubRepository clubRepository;

    @Autowired
    private ClubMemberRepository clubMemberRepository;

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leader;
    private String leaderToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        leader = saveStudent("외부폼리더");
        leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());
    }

    @Test
    @DisplayName("허용 플랫폼(구글 폼·네이버 폼)의 https 주소로는 외부 폼 모집이 생성된다")
    void createsExternalRecruitmentWithWhitelistedUrl() {
        // 동아리당 활성 모집은 1개뿐이라(uk_recruitment_club_active) 성공 케이스는 각자 동아리를 만든다.
        createExternal(saveActiveClubLedByLeader("구글폼단축동아리"), "https://forms.gle/aBcD1234", "")
                .statusCode(HttpStatus.CREATED.value());
        createExternal(saveActiveClubLedByLeader("구글폼동아리"),
                "https://docs.google.com/forms/d/e/1FAIpQLSf/viewform?usp=sf_link", "")
                .statusCode(HttpStatus.CREATED.value());
        createExternal(saveActiveClubLedByLeader("네이버폼동아리"), "https://form.naver.com/response/abc123", "")
                .statusCode(HttpStatus.CREATED.value());
        createExternal(saveActiveClubLedByLeader("네이버단축동아리"), "https://naver.me/5sulQYsy", "")
                .statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("허용 목록 밖 주소로 외부 폼 모집을 만들면 400 과 허용 플랫폼 안내를 받는다")
    void rejectsUrlOutsideWhitelist() {
        Club club = saveActiveClubLedByLeader("허용목록밖동아리");

        createExternal(club, "https://example.com/form", "")
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("ok", equalTo(false))
                .body("message", containsString("forms.gle"))
                .body("message", containsString("form.naver.com"));

        // 호스트 위장은 허용 플랫폼 안내로 되돌린다.
        createExternal(club, "https://docs.google.com.evil.com/forms", "")
                .statusCode(HttpStatus.BAD_REQUEST.value());
        createExternal(club, "https://docs.google.com@evil.com/forms", "")
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("http 주소와 javascript: 스킴은 외부 폼 URL 로 쓸 수 없다")
    void rejectsNonHttpsSchemes() {
        Club club = saveActiveClubLedByLeader("스킴검증동아리");

        // 구 검증(^https?://)은 통과시켰던 값 — 화이트리스트 전환으로 https 만 남는다.
        createExternal(club, "http://forms.gle/aBcD1234", "")
                .statusCode(HttpStatus.BAD_REQUEST.value());
        // @Pattern 제거 뒤에도 저장형 XSS 벡터가 그대로 막히는지 회귀 잠금.
        createExternal(club, "javascript:alert(document.cookie)", "")
                .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("외부 폼 모집에 면접 진행·지원자 수 공개·안내문을 실어 보내면 400 으로 거부된다")
    void rejectsFeaturesUnavailableForExternalMode() {
        Club club = saveActiveClubLedByLeader("외부폼제약동아리");
        LocalDate today = LocalDate.now();

        postRecruitment(club, """
                {
                  "title": "면접 켠 외부 폼 모집",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "applicationMode": "EXTERNAL",
                  "externalFormUrl": "https://forms.gle/aBcD1234",
                  "useInterview": true
                }
                """.formatted(today, today.plusDays(7)))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", containsString("면접"));

        postRecruitment(club, """
                {
                  "title": "지원자 수 공개한 외부 폼 모집",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "applicationMode": "EXTERNAL",
                  "externalFormUrl": "https://forms.gle/aBcD1234",
                  "showApplicantCount": true
                }
                """.formatted(today, today.plusDays(7)))
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", containsString("지원자 수"));

        createExternal(club, "https://forms.gle/aBcD1234", "지원 전에 꼭 읽어주세요")
                .statusCode(HttpStatus.BAD_REQUEST.value())
                .body("message", containsString("안내문"));
    }

    @Test
    @DisplayName("자체 폼 모집은 안내문·면접 진행·지원자 수 공개를 그대로 사용할 수 있다")
    void selfFormRecruitmentIsUnaffected() {
        Club club = saveActiveClubLedByLeader("자체폼회귀동아리");
        LocalDate today = LocalDate.now();

        postRecruitment(club, """
                {
                  "title": "자체 폼 모집",
                  "content": "지원 전에 꼭 읽어주세요",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "useInterview": true,
                  "showApplicantCount": true,
                  "interviewStartDate": "%s",
                  "interviewEndDate": "%s",
                  "questionItems": [{"text": "지원 동기를 알려주세요", "type": "TEXT", "required": true}]
                }
                """.formatted(today, today.plusDays(7), today.plusDays(8), today.plusDays(9)))
                .statusCode(HttpStatus.CREATED.value());
    }

    private ValidatableResponse createExternal(Club club, String externalFormUrl, String content) {
        LocalDate today = LocalDate.now();
        return postRecruitment(club, """
                {
                  "title": "외부 폼 모집",
                  "content": "%s",
                  "startDate": "%s",
                  "endDate": "%s",
                  "capacity": 10,
                  "applicationMode": "EXTERNAL",
                  "externalFormUrl": "%s"
                }
                """.formatted(content, today, today.plusDays(7), externalFormUrl));
    }

    private ValidatableResponse postRecruitment(Club club, String requestBody) {
        return RestAssured.given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                    .contentType(ContentType.JSON)
                    .body(requestBody)
                .when()
                    .post("/api/v1/leader/clubs/{clubId}/recruitments", club.getId())
                .then();
    }

    private User saveStudent(String name) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClubLedByLeader(String name) {
        String uniqueName = name + "-" + sequence.incrementAndGet();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        Club savedClub = clubRepository.save(club);
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));
        return savedClub;
    }
}
