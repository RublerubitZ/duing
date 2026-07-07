# PR-1: 운영 중단 동아리 모집 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리가 운영 중단(INACTIVE)으로 전환될 때 OPEN 모집을 벌크 UPDATE 로 자동 마감하고, 공개 달력·공개 모집 상세·마감 임박 알림에서 비 ACTIVE 동아리의 모집을 차단한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-07-club-status-followup-design.md` Part A (D1=자동 마감 확정, D2=지원서 미변경 확정). 전환 오케스트레이션은 `GeneralClubService.updateStatus`(행 잠금 트랜잭션) 안에서 `RecruitmentService.closeAllOnClubDeactivation` 을 호출하고, 구현은 JPQL 벌크 UPDATE 1문(`@SQLRestriction` 미적용이므로 `deletedAt IS NULL` 명시, `flushAutomatically/clearAutomatically`). 조회 방어선은 달력 QueryDSL·공개 상세 서비스 가드(404 존재 은닉)·알림 네이티브 쿼리 3곳.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured + Testcontainers

**사전 확인된 사실 (정찰):**
- `uk_recruitment_club_active`(V38) 로 club 당 OPEN 모집은 최대 1건 — 테스트 픽스처는 OPEN 1 + CLOSED 1 조합으로 구성
- 벌크 UPDATE 전례: `RecruitmentRepository.softDeleteByIds` (`@Modifying(flushAutomatically = true, clearAutomatically = true)`)
- `recruitmentService.getById` 호출처 = 공개 `RecruitmentController:38` 단 1곳, `findOverlappingPeriod` 호출처 = `GeneralRecruitmentService:82`(달력) 단 1곳 → 서비스/쿼리 레벨 가드 안전
- `GeneralClubService` 는 이미 `RecruitmentRepository` 를 주입 중이며, `GeneralRecruitmentService` 는 `ClubService` 에 의존하지 않아 `RecruitmentService` 주입 시 순환 없음
- 알림 후보 쿼리는 native SQL (`findDeadlineNotificationCandidates`) — `c.deleted_at IS NULL` 은 이미 있고 `c.status` 조건만 없음

**리뷰 파이프라인 (task 마다):** implementer → spec reviewer → duing-code-reviewer → codex:review. 상태전이·벌크·알림 해당이므로 마지막에 브랜치 adversarial 리뷰 1회.

**Out of Scope:** 재활성 시 모집 자동 복구(스펙 확정), Part B/C(별도 PR), FE 변경 없음.

---

## Task 0: 브랜치 생성

- [ ] `git checkout develop && git pull && git checkout -b feat/club-deactivation-recruitment-cleanup`

---

## Task 1: 벌크 마감 + 전환 오케스트레이션

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/RecruitmentService.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/GeneralClubService.java` (updateStatus)
- Create(Test): `backend/src/test/java/com/duing/domain/club/controller/AdminClubDeactivationRecruitmentTest.java`

- [ ] **Step 1: 실패하는 통합 테스트 작성** — 새 파일 (픽스처는 `AdminClubClosureControllerTest` 의 saveUser/saveClubWithLeader/리플렉션 status 패턴 재사용):

```java
package com.duing.domain.club.controller;

import static org.hamcrest.Matchers.equalTo;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Assertions;
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
class AdminClubDeactivationRecruitmentTest extends IntegrationTestBase {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User leaderUser;
    private String adminToken;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        User adminUser = saveUser("총동연관리자", UserRole.ADMIN);
        leaderUser = saveUser("동아리장", UserRole.STUDENT);
        adminToken = jwtTokenProvider.createToken(adminUser.getId(), adminUser.getRole().name());
    }

    @Test
    @DisplayName("운영 중단 전환 시 OPEN 모집은 CLOSED 로 일괄 마감되고 기존 CLOSED 모집과 지원서 상태는 변하지 않는다")
    void deactivationClosesOpenRecruitmentsWithoutTouchingApplications() throws Exception {
        Club club = saveClubWithLeader("중단전환클럽", ClubStatus.ACTIVE);
        Recruitment openRecruitment = recruitmentRepository.save(Recruitment.create(
                club, "진행중모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        Recruitment closedRecruitment = saveClosedRecruitment(club, "지난모집");
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Application application = applicationRepository.save(
                Application.submit(openRecruitment, applicant, List.of()));

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(openRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(closedRecruitment.getId()).orElseThrow().getStatus());
        Assertions.assertEquals(ApplicationStatus.SUBMITTED,
                applicationRepository.findById(application.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("운영 중단 후 재활성해도 마감된 모집은 자동 복구되지 않는다")
    void reactivationDoesNotReopenRecruitments() throws Exception {
        Club club = saveClubWithLeader("재활성클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "재활성모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));

        patchStatus(club.getId(), ClubStatus.INACTIVE);
        patchStatus(club.getId(), ClubStatus.ACTIVE);

        Assertions.assertEquals(RecruitmentStatus.CLOSED,
                recruitmentRepository.findById(recruitment.getId()).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("soft delete 된 모집은 운영 중단 벌크 마감의 대상이 아니다")
    void softDeletedRecruitmentIsNotTouchedByBulkClose() throws Exception {
        Club club = saveClubWithLeader("소프트삭제클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "삭제된모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 5));
        jdbcTemplate.update("UPDATE recruitment SET deleted_at = NOW() WHERE id = ?", recruitment.getId());

        patchStatus(club.getId(), ClubStatus.INACTIVE);

        String status = jdbcTemplate.queryForObject(
                "SELECT status FROM recruitment WHERE id = ?", String.class, recruitment.getId());
        Assertions.assertEquals("OPEN", status);
    }

    private void patchStatus(Long clubId, ClubStatus next) {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                    .contentType(ContentType.JSON)
                    .body("{\"status\":\"" + next.name() + "\"}")
                .when()
                    .patch("/api/v1/admin/clubs/{clubId}/status", clubId)
                .then()
                    .statusCode(HttpStatus.NO_CONTENT.value());
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                role,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveClubWithLeader(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, status);
        Club saved = clubRepository.save(created);
        clubMemberRepository.save(ClubMember.asLeader(saved, leaderUser));
        return saved;
    }

    private Recruitment saveClosedRecruitment(Club club, String title) {
        Recruitment created = Recruitment.create(club, title, "내용",
                LocalDate.now().minusDays(30), LocalDate.now().minusDays(10), 5);
        created.close();
        return recruitmentRepository.save(created);
    }
}
```

주의: PATCH status 응답 코드는 기존 `AdminClubStatusAndCentralClubControllerTest` 를 Read 해 실제 코드(200/204)와 일치시킬 것. `Recruitment.close()`·`Application.submit(...)`·`ApplicationStatus.SUBMITTED` 시그니처도 기존 테스트에서 확인 후 다르면 맞춰 조정 (그 경우 보고에 명시).

- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests 'com.duing.domain.club.controller.AdminClubDeactivationRecruitmentTest'` → 첫 테스트에서 OPEN 이 CLOSED 로 안 바뀌어 FAIL (soft delete 테스트는 통과할 수 있음 — 정상).

- [ ] **Step 3: 구현**

`RecruitmentRepository.java` — `softDeleteByIds` 아래에 추가:

```java
    /**
     * 동아리 운영 중단(INACTIVE) 전환 시 OPEN 모집을 일괄 마감한다 (스펙 Part A · D1).
     * 벌크 UPDATE 에는 @SQLRestriction 이 적용되지 않으므로 deletedAt IS NULL 을 명시한다.
     * 행 잠금 하 updateStatus 트랜잭션의 1차 캐시와 어긋나지 않도록 flush/clear 를 자동 수행한다.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE Recruitment r
               SET r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.CLOSED
             WHERE r.club.id = :clubId
               AND r.status = com.duing.domain.recruitment.entity.RecruitmentStatus.OPEN
               AND r.deletedAt IS NULL
            """)
    int closeAllOpenByClubId(@Param("clubId") Long clubId);
```

`RecruitmentService.java` — `closeAllOnClubClosure` 선언 근처에 추가:

```java
    /**
     * 동아리 운영 중단(INACTIVE) 전환 시 OPEN 모집을 일괄 마감한다.
     * 폐쇄(closeAllOnClubClosure)와 달리 soft delete 는 하지 않는다 — 되돌릴 수 있는 상태이므로 기록 보존.
     * @return 마감된 모집 수
     */
    int closeAllOnClubDeactivation(Long clubId);
```

`GeneralRecruitmentService.java`:

```java
    @Override
    @Transactional
    public int closeAllOnClubDeactivation(Long clubId) {
        return recruitmentRepository.closeAllOpenByClubId(clubId);
    }
```

`GeneralClubService.java` — 필드 `private final RecruitmentService recruitmentService;` 추가(import 포함), `updateStatus` 끝에:

```java
        if (updateClubStatusCommand.status() == ClubStatus.INACTIVE) {
            // 운영 중단 = 신규 모집 활동 정지. OPEN 모집을 일괄 마감해 공개 표면·알림에 남지 않게 한다 (스펙 Part A).
            recruitmentService.closeAllOnClubDeactivation(club.getId());
        }
```

- [ ] **Step 4: 통과 확인** — 신규 테스트 + 회귀: `./gradlew test --tests 'com.duing.domain.club.controller.AdminClubDeactivationRecruitmentTest' --tests 'com.duing.domain.club.controller.AdminClubStatusAndCentralClubControllerTest' --tests 'com.duing.domain.club.controller.AdminClubClosureControllerTest' --tests 'com.duing.domain.recruitment.*'` → PASS, BUILD SUCCESSFUL 직접 확인.

- [ ] **Step 5: 커밋** — `feat(backend): 동아리 운영 중단 전환 시 OPEN 모집 일괄 마감`

---

## Task 2: 조회 방어선 (달력·공개 상세·마감 알림)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java` (findOverlappingPeriod)
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepository.java` (findDeadlineNotificationCandidates)
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/GeneralRecruitmentService.java` (getById)
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubDeactivationRecruitmentTest.java` (케이스 추가)
- Test: `backend/src/test/java/com/duing/domain/notification/job/DeadlineNotificationJobTest.java` (케이스 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — `AdminClubDeactivationRecruitmentTest` 에 추가 (지원서 없는 별도 동아리 사용):

```java
    @Test
    @DisplayName("운영 중단 동아리의 모집은 공개 달력과 공개 상세에서 노출되지 않는다")
    void deactivatedClubRecruitmentIsHiddenFromPublicSurfaces() throws Exception {
        Club club = saveClubWithLeader("공개차단클럽", ClubStatus.ACTIVE);
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "차단대상모집", "내용", LocalDate.of(2031, 3, 2), LocalDate.of(2031, 3, 20), 5));
        // 직접 SQL 로 CLOSED 마감을 우회해 "필터가 없으면 노출되는" 상태를 만든다 —
        // 조회 방어선이 벌크 마감과 독립적으로 동작하는지 검증 (이중 방어).
        jdbcTemplate.update("UPDATE club SET status = 'INACTIVE' WHERE id = ?", club.getId());

        RestAssured.given()
                .when().get("/api/v1/recruitments?yearMonth=2031-03")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.findAll { it.recruitmentId == " + recruitment.getId() + " }.size()", equalTo(0));

        RestAssured.given()
                .when().get("/api/v1/recruitments/{recruitmentId}", recruitment.getId())
                .then().statusCode(HttpStatus.NOT_FOUND.value())
                .body("ok", equalTo(false));
    }
```

(달력 응답의 JSON 경로는 실제 `RecruitmentController` 달력 응답 DTO 를 Read 해 필드명에 맞게 조정 — `data` 가 배열인지 `data.content` 인지, 모집 id 필드명이 `recruitmentId` 인지 `id` 인지 확인 후 작성. 다르면 보고에 명시.)

`DeadlineNotificationJobTest` 를 Read 하고 기존 픽스처 패턴 그대로 케이스 1개 추가: "운영 중단 동아리의 마감 임박 모집은 알림 후보에서 제외된다" — INACTIVE 동아리 + endDate 가 `today+3` 인 OPEN 모집(직접 SQL 로 club 상태만 전환) 을 만들고 `findDeadlineNotificationCandidates(today)` 결과에 미포함 단언. 날짜는 반드시 상대 날짜(`LocalDate.now()` 기준) — 하드코딩 미래 절대 날짜 금지.

- [ ] **Step 2: 실패 확인** — 달력/상세/알림 3개 케이스가 노출되어 FAIL.

- [ ] **Step 3: 구현**

`RecruitmentRepositoryImpl.findOverlappingPeriod` — club 조인 + ACTIVE 필터 (import: `static com.duing.domain.club.entity.QClub.club`, `com.duing.domain.club.entity.ClubStatus`):

```java
    @Override
    public List<Recruitment> findOverlappingPeriod(LocalDate periodStart, LocalDate periodEnd) {
        return queryFactory
                .selectFrom(recruitment)
                .join(recruitment.club, club)
                .where(
                        recruitment.startDate.loe(periodEnd),
                        recruitment.endDate.goe(periodStart),
                        club.status.eq(ClubStatus.ACTIVE)
                )
                .orderBy(recruitment.startDate.asc(), recruitment.id.asc())
                .fetch();
    }
```

`RecruitmentRepository.findDeadlineNotificationCandidates` — WHERE 절에 한 줄 추가:

```sql
             WHERE r.status = 'OPEN' AND r.deleted_at IS NULL AND c.deleted_at IS NULL
               AND c.status = 'ACTIVE'
```

`GeneralRecruitmentService.getById` — 로드 직후 가드 (import `com.duing.domain.club.entity.ClubStatus`):

```java
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        // 비공개 상태 동아리의 모집은 존재를 숨긴다(404). 이 메서드의 호출처는 공개 컨트롤러 1곳뿐이다.
        if (recruitment.getClub().getStatus() != ClubStatus.ACTIVE) {
            throw new RecruitmentException.RecruitmentNotFoundException();
        }
```

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.club.controller.AdminClubDeactivationRecruitmentTest' --tests 'com.duing.domain.notification.*' --tests 'com.duing.domain.recruitment.*' --tests 'com.duing.domain.application.*'` → PASS, BUILD SUCCESSFUL. (공개 상세를 쓰는 지원 플로우 회귀 포함)

- [ ] **Step 5: 커밋** — `fix(backend): 공개 달력·모집 상세·마감 알림에서 비 ACTIVE 동아리 모집 차단`

---

## Task 3: 전체 테스트 + PR

- [ ] `cd backend && ./gradlew test` → BUILD SUCCESSFUL (출력 직접 확인)
- [ ] self-check 7항목 (빌드·범위·타측면 영향·리뷰 완료·plan 재검증·커밋 규칙·EOF newline)
- [ ] push + PR 생성 (제목: `feat(backend): 운영 중단 동아리 모집 자동 마감 및 공개 노출 차단`, 본문 🚀/🤔/💬, 머지 금지)
