package com.duing.domain.clubevent;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.clubevent.repository.ClubEventRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
 * 총동연 전 동아리 일정 집계 조회의 노출 범위 검증.
 *
 * <p>이 엔드포인트에서 유일하게 새로운 동작은 "어떤 동아리의 일정까지 총동연에게 보이는가" 다.
 * 조인 조건이 빠지면 삭제·비 ACTIVE 동아리의 내부 일정이 조용히 노출되며(fail-open),
 * 기존 어떤 테스트도 이를 잡지 못한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AdminClubEventAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubEventRepository eventRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private String adminToken;
    private Long eventCreatorId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User admin = userRepository.save(UserFixture.admin());
        adminToken = jwtTokenProvider.createToken(admin.getId(), admin.getRole().name());
        eventCreatorId = userRepository.save(UserFixture.unique()).getId();
    }

    @Test
    @DisplayName("삭제되거나 비 ACTIVE 인 동아리의 일정은 총동연 조회 결과에서 제외된다")
    void listExcludesDeletedAndNonActiveClubEvents() {
        // 절대 날짜는 CI 시한폭탄이라 오늘 기준 상대 날짜로만 구성한다.
        LocalDateTime startAt = LocalDateTime.now().plusDays(3).withNano(0);

        Long activeClubId = saveClub("활성 동아리", ClubStatus.ACTIVE);
        Long deletedClubId = saveClub("삭제된 동아리", ClubStatus.ACTIVE);
        Long inactiveClubId = saveClub("운영 중단 동아리", ClubStatus.INACTIVE);
        Long pendingClubId = saveClub("승인 대기 동아리", ClubStatus.PENDING_APPROVAL);

        Long visibleEventId = saveEvent(activeClubId, "정기 공연", startAt);
        Long deletedEventId = saveEvent(activeClubId, "취소된 공연", startAt);
        saveEvent(deletedClubId, "삭제된 동아리의 일정", startAt);
        saveEvent(inactiveClubId, "운영 중단 동아리의 일정", startAt);
        saveEvent(pendingClubId, "승인 대기 동아리의 일정", startAt);

        eventRepository.deleteById(deletedEventId);
        clubRepository.deleteById(deletedClubId);

        LocalDate from = LocalDate.now().minusDays(1);
        LocalDate to = LocalDate.now().plusDays(30);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .when().get("/api/v1/admin/club-events?from=" + from + "&to=" + to)
                .then().statusCode(HttpStatus.OK.value())
                .body("data", hasSize(1))
                .body("data[0].id", equalTo(visibleEventId.intValue()))
                .body("data[0].clubId", equalTo(activeClubId.intValue()))
                .body("data[0].clubName", equalTo("활성 동아리"))
                .body("data[0].title", equalTo("정기 공연"))
                .body("data[0].startAt", notNullValue())
                .body("data[0].endAt", notNullValue())
                .body("data[0].location", equalTo("대강당"));
    }

    private Long saveClub(String name, ClubStatus status) {
        Club club = clubRepository.save(Club.create(name, ClubCategory.ACADEMIC, null, "설명", null));
        // Club.create 는 항상 PENDING_APPROVAL 로 시작하므로 검증 대상 상태로 직접 전환한다.
        jdbcTemplate.update("UPDATE club SET status = ? WHERE id = ?", status.name(), club.getId());
        return club.getId();
    }

    private Long saveEvent(Long clubId, String title, LocalDateTime startAt) {
        ClubEvent event = ClubEvent.create(clubId, title, "설명",
                startAt, startAt.plusHours(2), "대강당", eventCreatorId);
        return eventRepository.save(event).getId();
    }
}
