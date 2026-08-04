package com.duing.domain.recruitment.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import io.restassured.RestAssured;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
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
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 공개 모집 목록 응답의 마감 시각(closedAt) 계약.
 *
 * <p>지원 현황 아카이브가 "언제 마감됐는지"로 정렬·표기하므로 목록 응답이 실제 종료 시각을 내려야 한다.
 * closed_at 은 seoulClock 벽시계로 기록되므로 KST 기준 절대시각(…Z)으로 변환돼 나가야 하고,
 * 종료 시각이 없는 레거시 마감 건은 null 로 내려가야 한다(V101 이전 CLOSED 행).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ClubRecruitmentClosedAtResponseTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    /** 마감 시각은 프로덕션과 같은 seoulClock 으로 찍는다 — 시스템 존(UTC CI)으로 찍으면 KST 로 해석돼 −9h 가 된다. */
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("마감 처리된 모집은 공개 목록 응답에 실제 마감 시각이 절대시각으로 담긴다")
    void closedRecruitmentExposesClosedAt() throws Exception {
        Club club = saveActiveClub("마감시각동아리");
        Recruitment recruitment = saveRecruitment(club, "마감된모집");

        Instant beforeClose = Instant.now();
        recruitment.close(LocalDateTime.now(clock));
        recruitmentRepository.save(recruitment);

        String closedAt = RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.size()", equalTo(1))
                    .extract().jsonPath().getString("data[0].closedAt");

        assertThat(closedAt).as("Event Time 은 오프셋 있는 절대시각(…Z) 으로 직렬화된다").endsWith("Z");
        // 양방향 오차 단언 — 한쪽만 보면 타임존 regime 착오(seoul 을 system 으로 변환 시 −9h)가 통과한다.
        assertThat(Duration.between(beforeClose, Instant.parse(closedAt)))
                .as("마감 시각은 마감 처리 시점 (KST 벽시계 → 절대시각 변환 정합)")
                .isBetween(Duration.ofMinutes(-5), Duration.ofMinutes(5));
    }

    @Test
    @DisplayName("마감 시각이 기록되지 않은 레거시 마감 모집은 목록 응답의 마감 시각이 null 이다")
    void legacyClosedRecruitmentExposesNullClosedAt() throws Exception {
        Club club = saveActiveClub("레거시마감동아리");
        Recruitment recruitment = saveRecruitment(club, "레거시마감모집");
        // V101 이전에 마감된 행 — status 만 CLOSED 이고 종료 시각은 알 수 없다.
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED', closed_at = NULL WHERE id = ?",
                recruitment.getId());

        RestAssured
                .given()
                .when()
                    .get("/api/v1/clubs/{clubId}/recruitments", club.getId())
                .then()
                    .statusCode(HttpStatus.OK.value())
                    .body("data.size()", equalTo(1))
                    .body("data[0].status", equalTo("CLOSED"))
                    .body("data[0].closedAt", nullValue());
    }

    private Recruitment saveRecruitment(Club club, String title) {
        return recruitmentRepository.save(Recruitment.create(
                club, title, "내용", LocalDate.now().minusDays(10), LocalDate.now().minusDays(1), 5));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club created = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
