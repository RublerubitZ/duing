# 면접 스케줄링 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 면접 스케줄링 백엔드(PR #305 머지 완료) 위에 운영진 면접 관리 페이지 + 지원자 제출 폼 2-Step 확장 + 지원자 마이페이지 면접 일정 카드 + 가능시간 수정 모달을 단일 SoT(OpenAPI gen:api) 기반으로 구현한다.

**Architecture:** Single-route server-derived Stepper (운영진 측), 2-Step UI 클라이언트 state (지원자 측), `packages/{types,api,hooks,schemas}` RN 공유 비즈니스 로직 + `apps/web/components/interview/` web 전용 공용 UI. Backend PR-IS 5 commit 으로 location/지원자 endpoint/RecruitmentDetail 확장 선행.

**Tech Stack:** Next.js 15 App Router · React 19 · TanStack Query 5 · ky · React Hook Form + Zod · Tailwind · MSW + Vitest + RTL · Spring Boot 3.4 (Java 21) · Flyway · PostgreSQL

**선행 spec:** [docs/superpowers/specs/2026-06-08-interview-scheduling-frontend-design.md](../specs/2026-06-08-interview-scheduling-frontend-design.md)

---

## Phase 의존성

```
Task 0 (사전 확인)
   ↓
Task 1 (Backend PR-IS, 5 commit)
   ↓ 머지
Task 2 (PR-FE0: packages 골격)
   ↓ 머지
   ├──────────────────────────┐
   ↓                           ↓
Task 3 (PR-FE1)              Task 6 (PR-FE4)
   ↓                           ↓
Task 4 (PR-FE2)              Task 7 (PR-FE5)
   ↓
Task 5 (PR-FE3)
```

운영진 트랙 (Task 3→4→5) 과 지원자 트랙 (Task 6→7) 은 Task 2 머지 후 병렬 가능.

---

## Task 0: 사전 확인

**목적:** 작업 시작 전 spec §11 의 5 그룹 확인 항목을 모두 점검하여 후속 task 들이 동일한 가정 위에서 진행되도록 한다.

**Files:**
- Create: `frontend/docs/interview-scheduling-prework-notes.md` (확인 결과 기록)

- [ ] **Step 1: Backend 현재 상태 확인**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git log --oneline | grep -i interview | head -5
```
PR #305 (`ce4ee45`) 의 머지가 develop tip 근처에 있어야 한다.

- [ ] **Step 2: 기존 frontend 라우트·컨벤션 확인**

```bash
ls frontend/apps/web/app/manage/clubs/\[clubId\]/recruitments/\[recruitmentId\]/
ls frontend/apps/web/app/apply/\[recruitmentId\]/_hooks/
ls frontend/apps/web/app/me/applications/\[applicationId\]/
ls frontend/apps/web/components/
ls frontend/packages/{types,api,hooks,schemas}/src/
```

확인 사항:
- `applicants` / `edit` / `stats` sibling 존재 (interview 도 같은 위치 추가 예정)
- `useAutosaveDraft.ts` 가 답변만 저장하는지
- `apps/web/components/{duing,report}` 등 도메인 폴더 네이밍 패턴

- [ ] **Step 3: Backend 도메인 응답 확인 (Open API 기준 정합성 확인 전 manual 확인)**

```bash
grep -A 5 "useInterview" frontend/packages/types/src/recruitment*.ts 2>&1 | head -20
grep -E "useInterview|interviewStartDate" backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java | head
```

`RecruitmentDetailResponse` 에 `useInterview: boolean` 가 있고 `interviewAvailabilityDeadline` 은 **없는** 상태 (Task 1 에서 추가 예정).

- [ ] **Step 4: 메모 작성**

`frontend/docs/interview-scheduling-prework-notes.md` 에 다음을 표로 정리:
- 현재 develop tip SHA
- 기존 라우트·컴포넌트 위치 (운영진/지원자 양쪽)
- `useAutosaveDraft` 의 draft 모델 (selectedSlotIds 미포함 확인)
- `apps/web/components/` 기존 도메인 폴더 명명 패턴 (`duing/`, `report/`)
- backend 의 `RecruitmentDetailResponse` 의 현재 필드 목록 (Task 1.5 의 변경 확인 baseline)

- [ ] **Step 5: 커밋**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout -b docs/interview-fe-prework
git add frontend/docs/interview-scheduling-prework-notes.md
git commit -m "docs(interview): frontend 사전 확인 메모"
```

이 commit 은 직접 develop 에 직접 push 하지 말고 PR 으로. 또는 Task 1 의 첫 commit 에 같이 묶어도 무방 (사용자 선호).

---

## Task 1 (Backend PR-IS): location + 지원자 endpoint + RecruitmentDetail 확장

**목적:** Frontend 가 의존하는 backend 보강 5 commit. spec §8.2 따름.

**Files:**
- Create: `backend/src/main/resources/db/migration/V47__alter_interview_config_add_location.sql`
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/dto/request/CreateInterviewConfigRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/dto/request/UpdateInterviewConfigRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/dto/command/CreateInterviewConfigCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/dto/command/UpdateInterviewConfigCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewConfigService.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/api/ManagerInterviewConfigApi.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/ManagerInterviewConfigController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/dto/response/InterviewConfigResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/dto/response/MyInterviewScheduleResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/dto/query/ScheduleListView.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewScheduleService.java`
- Create: `backend/src/main/java/com/duing/domain/interview/api/ApplicantInterviewSlotApi.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/ApplicantInterviewSlotController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/dto/response/ApplicantInterviewSlotResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/api/InterviewAvailabilityApi.java` (GET 추가)
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/InterviewAvailabilityController.java`
- Create: `backend/src/main/java/com/duing/domain/interview/controller/dto/response/MyInterviewAvailabilitiesResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/RecruitmentDetailResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/recruitment/repository/RecruitmentRepositoryImpl.java` (QueryDSL)
- Test files (시나리오마다 추가): `InterviewConfigServiceTest`, `ManagerInterviewConfigControllerTest`, `InterviewScheduleQueryTest`, `InterviewAutoAssignServiceTest`, `ApplicantInterviewSlotControllerTest` (신규), `InterviewAvailabilityControllerTest`, `RecruitmentDetailControllerTest`

- [ ] **Step 1: 브랜치 생성**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/interview-backend-is
```

### Commit 1 — InterviewConfig.location 필드 + V47 + Create/Update DTO

- [ ] **Step 2: V47 마이그레이션 작성**

`backend/src/main/resources/db/migration/V47__alter_interview_config_add_location.sql`:

```sql
ALTER TABLE interview_config
    ADD COLUMN location VARCHAR(200);
```

- [ ] **Step 3: InterviewConfig 엔티티에 location 필드 + 메서드 추가**

`backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java` 의 클래스 본문에 추가:

```java
@Column(length = 200)
private String location;
```

`create(...)` static 메서드 시그니처를 확장:

```java
public static InterviewConfig create(Long recruitmentId,
                                     LocalDateTime availabilityDeadline,
                                     String location) {
    InterviewConfig config = InterviewConfig.builder()
            .recruitmentId(recruitmentId)
            .availabilityDeadline(availabilityDeadline)
            .build();
    if (location != null) {
        String trimmed = location.trim();
        if (!trimmed.isEmpty()) {
            config.location = trimmed;
        }
    }
    return config;
}
```

신규 인스턴스 메서드:

```java
public void updateLocation(String newLocation) {
    if (newLocation == null) {
        return;     // null = unchanged
    }
    String trimmed = newLocation.trim();
    if (trimmed.isEmpty()) {
        return;     // blank = unchanged (MVP 에선 clear 미지원)
    }
    this.location = trimmed;
}
```

`updateDeadline(...)` 메서드는 그대로.

- [ ] **Step 4: Builder 파라미터 검토**

Lombok `@Builder` 가 모든 필드를 받으므로 별도 변경 불필요. 단, 기존 `InterviewConfig.create(rid, deadline)` (2-arg) 호출처 grep:

```bash
grep -rn "InterviewConfig.create(" backend/src --include="*.java" | head
```

호출처가 있다면 3-arg 시그니처로 갱신 + 두번째 인자에 `null` 전달:

```java
InterviewConfig.create(recruitmentId, deadline, null);
```

테스트 코드의 호출처도 같은 패턴.

- [ ] **Step 5: CreateInterviewConfigRequest 확장**

`backend/src/main/java/com/duing/domain/interview/controller/dto/request/CreateInterviewConfigRequest.java`:

```java
public record CreateInterviewConfigRequest(
        @NotNull(message = "마감 시각은 필수입니다")
        @Future(message = "마감 시각은 미래여야 합니다")
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이내여야 합니다")
        String location
) {
    public CreateInterviewConfigCommand toCommand(Long recruitmentId, Long actorUserId) {
        return new CreateInterviewConfigCommand(
                recruitmentId, actorUserId, availabilityDeadline, location);
    }
}
```

- [ ] **Step 6: UpdateInterviewConfigRequest 확장**

```java
public record UpdateInterviewConfigRequest(
        LocalDateTime availabilityDeadline,

        @Size(max = 200, message = "면접 장소는 200자 이내여야 합니다")
        String location
) {
    public UpdateInterviewConfigCommand toCommand(Long recruitmentId, Long actorUserId) {
        return new UpdateInterviewConfigCommand(
                recruitmentId, actorUserId, availabilityDeadline, location);
    }
}
```

- [ ] **Step 7: Command DTO 확장**

`CreateInterviewConfigCommand` + `UpdateInterviewConfigCommand` 에 `String location` 필드 추가.

- [ ] **Step 8: GeneralInterviewConfigService 갱신**

`create(...)` / `update(...)` 두 메서드 안 InterviewConfig 호출부:

```java
// create
InterviewConfig saved = configRepository.save(
        InterviewConfig.create(recruitment.getId(),
                command.availabilityDeadline(),
                command.location()));   // ★ 추가

// update
if (command.availabilityDeadline() != null) {
    validateDeadlineInRecruitmentPeriod(command.availabilityDeadline(), recruitment);
    config.updateDeadline(command.availabilityDeadline());
}
config.updateLocation(command.location());   // ★ 추가 (null/blank 은 메서드 내부에서 noop)
```

- [ ] **Step 9: InterviewConfigServiceTest 시나리오 4건 추가**

`backend/src/test/java/com/duing/domain/interview/service/InterviewConfigServiceTest.java` 에 추가:

```java
@Test
@DisplayName("create 시 location 이 함께 저장된다")
void createPersistsLocation() {
    // arrange + Recruitment, leader 등 fixture
    Long configId = configService.create(new CreateInterviewConfigCommand(
            recruitment.getId(), leader.getId(),
            LocalDateTime.now().plusDays(3), "공학관 2201호"));

    InterviewConfig config = configRepository.findById(configId).orElseThrow();
    assertThat(config.getLocation()).isEqualTo("공학관 2201호");
}

@Test
@DisplayName("update 시 location 이 null 이면 변경되지 않는다")
void updateWithNullLocationDoesNothing() {
    // 기존 config 가 "공학관 2201호" 일 때
    configService.update(new UpdateInterviewConfigCommand(
            recruitment.getId(), leader.getId(),
            LocalDateTime.now().plusDays(5), null));

    InterviewConfig config = configRepository.findById(configId).orElseThrow();
    assertThat(config.getLocation()).isEqualTo("공학관 2201호");
}

@Test
@DisplayName("update 시 location 이 공백만 있는 문자열이면 변경되지 않는다 (MVP 에서 clear 미지원)")
void updateWithBlankLocationDoesNothing() {
    configService.update(new UpdateInterviewConfigCommand(
            recruitment.getId(), leader.getId(),
            null, "   "));

    InterviewConfig config = configRepository.findById(configId).orElseThrow();
    assertThat(config.getLocation()).isEqualTo("공학관 2201호");
}

@Test
@DisplayName("create 시 location 이 200자 초과면 400 이 반환된다")
void createRejectsTooLongLocation() {
    // 컨트롤러 통합 테스트로 옮겨야 의미 있음.
    // 본 시나리오는 ManagerInterviewConfigControllerTest 로 이동.
}
```

200자 초과 검증은 controller test 로 옮긴다 (`@Valid` 가 컨트롤러 진입부에서 동작).

- [ ] **Step 10: 빌드 + 테스트**

```bash
cd backend
./gradlew test --tests "InterviewConfigServiceTest" --console=plain 2>&1 | tail -10
```
모두 통과.

- [ ] **Step 11: Commit 1**

```bash
git add -A
git commit -m "feat(interview): InterviewConfig.location 필드 (MVP 본체) + V47 + create/update DTO"
```

### Commit 2 — 운영진용 GET interview-config

- [ ] **Step 12: InterviewConfigResponse 작성**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/InterviewConfigResponse.java`:

```java
package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.entity.InterviewConfig;
import java.time.LocalDateTime;

public record InterviewConfigResponse(
        Long configId,
        LocalDateTime availabilityDeadline,
        LocalDateTime assignmentCompletedAt,
        String location
) {
    public static InterviewConfigResponse from(InterviewConfig config) {
        return new InterviewConfigResponse(
                config.getId(),
                config.getAvailabilityDeadline(),
                config.getAssignmentCompletedAt(),
                config.getLocation());
    }
}
```

- [ ] **Step 13: Service 인터페이스에 메서드 추가**

`InterviewConfigService.java`:

```java
InterviewConfigResponse getByRecruitmentId(Long recruitmentId, Long actorUserId);
```

`GeneralInterviewConfigService.java`:

```java
@Override
public InterviewConfigResponse getByRecruitmentId(Long recruitmentId, Long actorUserId) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

    InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId)
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);
    return InterviewConfigResponse.from(config);
}
```

- [ ] **Step 14: API + Controller 메서드 추가**

`ManagerInterviewConfigApi.java` (Swagger):

```java
@Operation(summary = "면접 설정 조회 (운영진)")
@GetMapping
ResponseEntity<ApiResponse<InterviewConfigResponse>> get(
        @PathVariable Long recruitmentId,
        @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
```

`ManagerInterviewConfigController.java`:

```java
@Override
public ResponseEntity<ApiResponse<InterviewConfigResponse>> get(
        Long recruitmentId, UserPrincipal currentUser) {
    InterviewConfigResponse response =
            configService.getByRecruitmentId(recruitmentId, currentUser.id());
    return ResponseEntity.ok(ApiResponse.success(response));
}
```

- [ ] **Step 15: ManagerInterviewConfigControllerTest 시나리오 추가**

```java
@Test
@DisplayName("운영진이 GET interview-config 호출 시 200 + configId/deadline/location 이 반환된다")
void getInterviewConfigReturnsOk() {
    // arrange: config 생성 (location="공학관 2201호")
    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .when().get(configUrl())
            .then().statusCode(200)
            .body("data.configId", notNullValue())
            .body("data.location", equalTo("공학관 2201호"))
            .body("data.availabilityDeadline", notNullValue());
}

@Test
@DisplayName("config 가 없는 모집에 GET 호출 시 404 InterviewConfigNotFound 가 반환된다")
void getInterviewConfigReturns404WhenAbsent() { ... }

@Test
@DisplayName("운영진이 아닌 사용자가 GET 호출 시 403 이 반환된다")
void getInterviewConfigReturns403ForOutsider() { ... }

@Test
@DisplayName("create 시 location 이 200자 초과면 400 이 반환된다")
void createRejectsTooLongLocation() {
    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .contentType("application/json")
            .body("{\"availabilityDeadline\": \"...\", \"location\": \"" + "x".repeat(201) + "\"}")
            .when().post(configUrl())
            .then().statusCode(400);
}
```

- [ ] **Step 16: 빌드 + 테스트**

```bash
./gradlew test --tests "InterviewConfigServiceTest" --tests "ManagerInterviewConfigControllerTest" --console=plain 2>&1 | tail -10
```

- [ ] **Step 17: Commit 2**

```bash
git add -A
git commit -m "feat(interview): 운영진용 GET interview-config endpoint 추가"
```

### Commit 3 — A2 + M8 응답에 location 노출

- [ ] **Step 18: MyInterviewScheduleResponse 에 location 추가**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/MyInterviewScheduleResponse.java`:

```java
public record MyInterviewScheduleResponse(
        boolean assigned,
        InterviewScheduleDetail schedule,
        String location            // ★ 추가 (assigned=false 면 null)
) {
    public record InterviewScheduleDetail(
            Long scheduleId, Long slotId,
            LocalDateTime startTime, LocalDateTime endTime,
            InterviewScheduleStatus status, LocalDateTime assignedAt
    ) {}
}
```

- [ ] **Step 19: GeneralInterviewScheduleService.findMySchedule 갱신**

```java
@Override
public MyInterviewScheduleResponse findMySchedule(Long applicationId, Long actorUserId) {
    Application application = applicationRepository.findById(applicationId)
            .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
    if (!application.getUser().getId().equals(actorUserId)) {
        throw new InterviewException.NotApplicationOwner();
    }

    return scheduleRepository.findByApplicationId(applicationId)
            .map(schedule -> {
                InterviewSlot slot = slotRepository.findById(schedule.getSlotId())
                        .orElseThrow(InterviewException.SlotNotFound::new);
                String location = configRepository.findByRecruitmentId(schedule.getRecruitmentId())
                        .map(InterviewConfig::getLocation)
                        .orElse(null);
                return new MyInterviewScheduleResponse(
                        true,
                        new MyInterviewScheduleResponse.InterviewScheduleDetail(
                                schedule.getId(), slot.getId(),
                                slot.getStartTime(), slot.getEndTime(),
                                schedule.getStatus(), schedule.getAssignedAt()),
                        location);
            })
            .orElseGet(() -> new MyInterviewScheduleResponse(false, null, null));
}
```

- [ ] **Step 20: ScheduleListView 에 location 추가**

`backend/src/main/java/com/duing/domain/interview/service/dto/query/ScheduleListView.java`:

```java
public record ScheduleListView(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        int capacity,
        String location,            // ★ 추가
        List<AssignedItem> assigned
) {
    public record AssignedItem(...) {}
}
```

`GeneralInterviewScheduleService.listSchedules(...)` 안에서 config 조회 후 slot 별로 같은 location 매핑:

```java
String location = configRepository.findByRecruitmentId(recruitmentId)
        .map(InterviewConfig::getLocation)
        .orElse(null);

return slots.stream()
        .map(slot -> new ScheduleListView(
                slot.getId(), slot.getStartTime(), slot.getEndTime(),
                slot.getCapacity(),
                location,                                       // ★
                assignedItems))
        .toList();
```

- [ ] **Step 21: 테스트 시나리오 추가**

`InterviewScheduleQueryTest`:

```java
@Test
@DisplayName("assigned=true 일 때 응답에 InterviewConfig.location 이 포함된다")
void mySchedulePopulatesLocation() { ... }

@Test
@DisplayName("config 의 location 이 null 일 때 응답 location 도 null")
void myScheduleLocationNullWhenConfigLocationNull() { ... }
```

`InterviewAutoAssignServiceTest` 의 `M8_슬롯별_그룹핑_일정_조회` 에 location 검증 추가:

```java
assertThat(slotView1.location()).isEqualTo("공학관 2201호");
```

- [ ] **Step 22: 빌드 + 테스트 + Commit 3**

```bash
./gradlew test --tests "InterviewScheduleQueryTest" --tests "InterviewAutoAssignServiceTest" --console=plain 2>&1 | tail -10
git add -A
git commit -m "feat(interview): A2 + M8 응답에 location 노출"
```

### Commit 4 — 지원자용 GET endpoint 2 개

- [ ] **Step 23: MyInterviewAvailabilitiesResponse 작성**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/MyInterviewAvailabilitiesResponse.java`:

```java
public record MyInterviewAvailabilitiesResponse(List<Long> slotIds) {
    public static MyInterviewAvailabilitiesResponse of(List<Long> slotIds) {
        return new MyInterviewAvailabilitiesResponse(slotIds);
    }
}
```

- [ ] **Step 24: InterviewAvailabilityService 인터페이스에 메서드 추가**

```java
MyInterviewAvailabilitiesResponse findMyAvailabilities(Long applicationId, Long actorUserId);
```

`GeneralInterviewAvailabilityService.java`:

```java
@Override
public MyInterviewAvailabilitiesResponse findMyAvailabilities(Long applicationId, Long actorUserId) {
    Application application = applicationRepository.findById(applicationId)
            .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
    if (!application.getUser().getId().equals(actorUserId)) {
        throw new InterviewException.NotApplicationOwner();
    }
    List<Long> slotIds = availabilityRepository.findByApplicationId(applicationId).stream()
            .map(InterviewAvailability::getSlotId)
            .toList();
    return MyInterviewAvailabilitiesResponse.of(slotIds);
}
```

- [ ] **Step 25: InterviewAvailabilityApi 에 GET 추가**

`backend/src/main/java/com/duing/domain/interview/api/InterviewAvailabilityApi.java`:

```java
@Operation(summary = "본인 면접 가능시간 조회")
@GetMapping("/api/v1/applications/{applicationId}/interview-availabilities")
ResponseEntity<ApiResponse<MyInterviewAvailabilitiesResponse>> findMyAvailabilities(
        @PathVariable Long applicationId,
        @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
```

`InterviewAvailabilityController.java` 에 메서드 구현 (기존 PUT 옆).

- [ ] **Step 26: ApplicantInterviewSlotResponse + Service + API + Controller 신규**

`backend/src/main/java/com/duing/domain/interview/controller/dto/response/ApplicantInterviewSlotResponse.java`:

```java
public record ApplicantInterviewSlotResponse(
        Long slotId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        int capacity
) {
    public static ApplicantInterviewSlotResponse from(InterviewSlot slot) {
        return new ApplicantInterviewSlotResponse(
                slot.getId(), slot.getStartTime(), slot.getEndTime(), slot.getCapacity());
    }
}
```

`InterviewSlotService` 인터페이스에 메서드 추가:

```java
List<ApplicantInterviewSlotResponse> listForApplicants(Long recruitmentId);
```

`GeneralInterviewSlotService.java`:

```java
@Override
public List<ApplicantInterviewSlotResponse> listForApplicants(Long recruitmentId) {
    Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    if (!recruitment.isEffectivelyOpen(LocalDate.now())) {
        throw new InterviewException.NoSlotsAvailable();    // 또는 다른 적절한 exception
    }
    return slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId).stream()
            .map(ApplicantInterviewSlotResponse::from)
            .toList();
}
```

`ApplicantInterviewSlotApi.java` 신규:

```java
@Tag(name = "Applicant Interview Slot")
@SecurityRequirement(name = "BearerAuth")
@RequestMapping("/api/v1/recruitments/{recruitmentId}/applicant-interview-slots")
public interface ApplicantInterviewSlotApi {
    @Operation(summary = "지원자가 면접 슬롯 목록 조회 (location 미포함)")
    @GetMapping
    ResponseEntity<ApiResponse<List<ApplicantInterviewSlotResponse>>> list(
            @PathVariable Long recruitmentId);
}
```

`ApplicantInterviewSlotController.java` 신규 (`@PreAuthorize("isAuthenticated()")`).

- [ ] **Step 27: 통합 테스트 시나리오**

신규 `ApplicantInterviewSlotControllerTest`:

```
✅ "지원자가 effectivelyOpen 인 모집의 슬롯을 조회하면 200 + 슬롯 배열을 반환한다"
✅ "응답에 location 필드가 포함되지 않는다"
✅ "effectivelyOpen 이 아닌 모집 조회 시 409 NoSlotsAvailable"
✅ "미인증 호출은 401"
```

`InterviewAvailabilityControllerTest` 에 GET 시나리오 3개 추가:

```
✅ "본인의 availability 목록 조회 시 200 + slotIds 배열 반환"
✅ "다른 사용자의 application 조회 시 403 NotApplicationOwner"
✅ "application 자체가 없으면 404"
```

- [ ] **Step 28: 빌드 + 테스트 + Commit 4**

```bash
./gradlew test --tests "ApplicantInterviewSlotControllerTest" --tests "InterviewAvailabilityControllerTest" --console=plain 2>&1 | tail -10
git add -A
git commit -m "feat(interview): 지원자용 신규 endpoint 2개 (interview-availabilities GET + applicant-interview-slots)"
```

### Commit 5 — RecruitmentDetail.interviewAvailabilityDeadline 추가

- [ ] **Step 29: RecruitmentDetailQuery 확장**

`backend/src/main/java/com/duing/domain/recruitment/service/dto/query/RecruitmentDetailQuery.java` 에 필드 추가:

```java
public record RecruitmentDetailQuery(
        Long id, Long clubId, String clubName, String title, String content,
        LocalDate startDate, LocalDate endDate, int capacity,
        RecruitmentStatus status, RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen, List<String> questions,
        ApplicationMode applicationMode, String externalFormUrl,
        boolean useInterview, TargetRole targetRole,
        LocalDate interviewStartDate, LocalDate interviewEndDate,
        boolean showApplicantCount, Integer applicantCount,
        LocalDateTime interviewAvailabilityDeadline   // ★ 추가
) {}
```

- [ ] **Step 30: RecruitmentDetailResponse 확장**

```java
public record RecruitmentDetailResponse(
        // ... 기존 필드들 ...
        Integer applicantCount,
        LocalDateTime interviewAvailabilityDeadline   // ★ 추가
) {
    public static RecruitmentDetailResponse from(RecruitmentDetailQuery q) {
        return new RecruitmentDetailResponse(
                q.id(), q.clubId(), q.clubName(),
                // ... 기존 매핑 그대로 ...
                q.applicantCount(),
                q.interviewAvailabilityDeadline());
    }
}
```

- [ ] **Step 31: RecruitmentRepositoryImpl (QueryDSL) 갱신**

`RecruitmentDetailQuery` 생성 부분에 `InterviewConfig.availabilityDeadline` left join + 매핑 추가:

```java
QInterviewConfig config = QInterviewConfig.interviewConfig;

return query.select(Projections.constructor(RecruitmentDetailQuery.class,
        // ... 기존 fields ...
        config.availabilityDeadline                      // ★ 추가
))
.from(recruitment)
.leftJoin(config).on(config.recruitmentId.eq(recruitment.id))
.where(recruitment.id.eq(recruitmentId))
.fetchOne();
```

`useInterview=false` 또는 config 없으면 null 자동 반환.

- [ ] **Step 32: 시나리오 테스트**

`RecruitmentDetailControllerTest` 또는 동등한 위치:

```
✅ "useInterview=true + config 있음 → interviewAvailabilityDeadline 노출"
✅ "useInterview=true + config 없음 → interviewAvailabilityDeadline null"
✅ "useInterview=false → interviewAvailabilityDeadline null"
```

- [ ] **Step 33: 빌드 + 전체 회귀 + Commit 5**

```bash
./gradlew test --console=plain 2>&1 | tail -5
git add -A
git commit -m "feat(recruitment): RecruitmentDetailResponse 에 interviewAvailabilityDeadline 추가"
```

전체 회귀 통과 확인.

- [ ] **Step 34: Push + PR 생성**

```bash
git push -u origin feat/interview-backend-is
gh pr create --base develop --head feat/interview-backend-is \
  --title "feat(interview): Backend PR-IS — location + 지원자 endpoint + RecruitmentDetail 확장" \
  --body "$(cat <<'EOF'
## 🚀 작업 내용

면접 스케줄링 frontend spec 의 선행 PR. 5 commit:

1. InterviewConfig.location 필드 (MVP 본체) + V47 + Create/Update DTO 확장
2. 운영진용 GET interview-config endpoint
3. A2 + M8 응답에 location 노출
4. 지원자용 GET interview-availabilities + GET applicant-interview-slots
5. RecruitmentDetailResponse 에 interviewAvailabilityDeadline 필드

## 🤔 고민했던 내용

- location 은 MVP 본체 schema 의 일부로 본다. V45 가 이미 머지된 사정으로 V47 별도 마이그레이션으로 추가하지만 의미상 V45 와 동등.
- location partial update 정책: null = 변경 없음, 빈 문자열 = 변경 없음. 명시적 clear 는 phase 2.
- 지원자용 slot endpoint 응답에 location 미포함 — UX 정책상 제출 단계에서 장소 비노출.

## 💬 리뷰 중점사항

- V47 마이그레이션의 NULL 허용 + 기존 row 영향 0
- ScheduleListView/MyInterviewScheduleResponse 매핑에서 config 조회가 N+1 일으키지 않는지
- ApplicantInterviewSlotController 의 권한 (isAuthenticated + recruitment.effectivelyOpen)
- RecruitmentRepositoryImpl 의 left join 이 useInterview=false 케이스에서도 정상 동작
EOF
)" 2>&1 | tail -3
```

PR URL 받아 사용자에게 머지 요청.

---

## Task 2 (PR-FE0): packages 골격 — types + api + hooks + schemas

**전제:** Task 1 (Backend PR-IS) 머지 완료.

**목적:** RN 공유 가능한 비즈니스 로직 골격을 구축. 후속 모든 PR-FE 의 의존성.

**Files:**
- Modify: `frontend/packages/api/src/openapi-types.ts` (gen:api 자동 생성)
- Create: `frontend/packages/types/src/interview.ts`
- Modify: `frontend/packages/api/src/client.ts` (15 메서드 추가)
- Create: `frontend/packages/hooks/src/interview.ts`
- Create: `frontend/packages/hooks/src/interviewQueryKeys.ts`
- Create: `frontend/packages/schemas/src/interview.ts`
- Test: `frontend/packages/api/test/interview.test.ts`
- Test: `frontend/packages/hooks/test/interview.test.ts`
- Test: `frontend/packages/schemas/test/interview.test.ts`

- [ ] **Step 1: 브랜치 + backend 부팅 + gen:api**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing
git checkout develop && git pull --ff-only
git checkout -b feat/interview-fe0-packages

# 다른 터미널에서 backend 부팅
cd backend && ./gradlew bootRun
# 부팅 완료 (Started DuingApplication 로그 확인) 후

cd ../frontend
pnpm gen:api
```

`packages/api/src/openapi-types.ts` 가 신규 endpoint 포함하여 갱신. diff 확인.

- [ ] **Step 2: packages/types/src/interview.ts 작성**

```ts
import type { components } from '@duing/api/openapi-types';

// 1:1 alias
export type InterviewConfig = components['schemas']['InterviewConfigResponse'];
export type ApplicantInterviewSlot = components['schemas']['ApplicantInterviewSlotResponse'];
export type SlotListView = components['schemas']['SlotListView'];
export type ScheduleListView = components['schemas']['ScheduleListViewResponse'];
export type AutoAssignResult = components['schemas']['AutoAssignResultResponse'];
export type MatchingCandidatesView = components['schemas']['MatchingCandidatesResponse'];
export type InterviewScheduleStatus = 'ASSIGNED' | 'CANCELLED';

// Backend PR-IS 신규
export type MyInterviewAvailabilities = components['schemas']['MyInterviewAvailabilitiesResponse'];

// Discriminated union — OpenAPI 미지원이라 client 에서 narrow
type AssignedSchedule = NonNullable<
    components['schemas']['MyInterviewScheduleResponse']['schedule']>;
export type MyInterviewSchedule =
    | { assigned: false; schedule: null; location: null }
    | { assigned: true; schedule: AssignedSchedule; location: string | null };

// View model (route-local 매핑 헬퍼용)
export type ManagementSlotAssignment = {
    scheduleId: number;
    applicationId: number;
    applicantLabel: string;
    status: InterviewScheduleStatus;
};
export type ManagementSlotView = {
    slotId: number;
    startTime: string;
    endTime: string;
    capacity: number;
    availabilityCount?: number;
    assignments?: ManagementSlotAssignment[];
};
```

`packages/types/src/index.ts` 에 export 추가:

```ts
export * from './interview';
```

- [ ] **Step 3: packages/types/test/interview.test.ts 작성 (간단한 타입 verification)**

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { MyInterviewSchedule } from '../src/interview';

describe('MyInterviewSchedule discriminated union', () => {
    it('assigned=false 일 때 schedule 은 null', () => {
        const value: MyInterviewSchedule = { assigned: false, schedule: null, location: null };
        if (!value.assigned) {
            expectTypeOf(value.schedule).toEqualTypeOf<null>();
        }
    });

    it('assigned=true 일 때 schedule 은 NonNull', () => {
        const value: MyInterviewSchedule = {
            assigned: true,
            schedule: { scheduleId: 1, slotId: 1, startTime: '...', endTime: '...',
                        status: 'ASSIGNED', assignedAt: '...' },
            location: '공학관 2201호',
        };
        if (value.assigned) {
            expectTypeOf(value.schedule.scheduleId).toEqualTypeOf<number>();
        }
    });
});
```

- [ ] **Step 4: packages/api/src/client.ts 에 15 메서드 추가**

기존 `DuingApiClient` 클래스 본문에 추가 (`ky` 인스턴스 활용):

```ts
// Manager — Config
createInterviewConfig(rid: number, body: { availabilityDeadline: string; location?: string }) {
    return this.api.post(`recruitments/${rid}/interview-config`, { json: body })
        .json<{ data: { configId: number } }>().then(r => r.data);
}
updateInterviewConfig(rid: number, body: { availabilityDeadline?: string; location?: string }) {
    return this.api.patch(`recruitments/${rid}/interview-config`, { json: body })
        .json<{ data: void }>().then(() => undefined);
}
getInterviewConfig(rid: number) {
    return this.api.get(`recruitments/${rid}/interview-config`)
        .json<{ data: InterviewConfig }>().then(r => r.data);
}

// Manager — Slots
createInterviewSlots(rid: number, body: { slots: Array<{ startTime: string; endTime: string; capacity: number }> }) {
    return this.api.post(`recruitments/${rid}/interview-slots`, { json: body })
        .json<{ data: { slotIds: number[] } }>().then(r => r.data);
}
getInterviewSlots(rid: number) {
    return this.api.get(`recruitments/${rid}/interview-slots`)
        .json<{ data: SlotListView[] }>().then(r => r.data);
}
updateInterviewSlot(slotId: number, body: { startTime?: string; endTime?: string; capacity?: number }) {
    return this.api.patch(`interview-slots/${slotId}`, { json: body })
        .json().then(() => undefined);
}
deleteInterviewSlot(slotId: number) {
    return this.api.delete(`interview-slots/${slotId}`).json().then(() => undefined);
}

// Manager — Auto assign
autoAssignInterview(rid: number) {
    return this.api.post(`recruitments/${rid}/interview-schedules/auto-assign`)
        .json<{ data: AutoAssignResult }>().then(r => r.data);
}
getInterviewSchedules(rid: number) {
    return this.api.get(`recruitments/${rid}/interview-schedules`)
        .json<{ data: ScheduleListView[] }>().then(r => r.data);
}
getMatchingCandidates(rid: number) {
    return this.api.get(`recruitments/${rid}/interview-matching-candidates`)
        .json<{ data: MatchingCandidatesView }>().then(r => r.data);
}
assignInterviewSchedule(applicationId: number, body: { slotId: number }) {
    return this.api.put(`applications/${applicationId}/interview-schedule`, { json: body })
        .json().then(() => undefined);
}
cancelInterviewSchedule(applicationId: number) {
    return this.api.delete(`applications/${applicationId}/interview-schedule`)
        .json().then(() => undefined);
}

// Applicant
updateInterviewAvailabilities(applicationId: number, body: { slotIds: number[] }) {
    return this.api.put(`applications/${applicationId}/interview-availabilities`, { json: body })
        .json().then(() => undefined);
}
getInterviewAvailabilities(applicationId: number) {
    return this.api.get(`applications/${applicationId}/interview-availabilities`)
        .json<{ data: MyInterviewAvailabilities }>().then(r => r.data);
}
getApplicantInterviewSlots(rid: number) {
    return this.api.get(`recruitments/${rid}/applicant-interview-slots`)
        .json<{ data: ApplicantInterviewSlot[] }>().then(r => r.data);
}

// A2 — discriminated union narrow
async getMyInterviewSchedule(applicationId: number): Promise<MyInterviewSchedule> {
    const raw = await this.api.get(`applications/${applicationId}/interview-schedule`)
        .json<{ data: { assigned: boolean; schedule: any; location: string | null } }>()
        .then(r => r.data);
    if (raw.assigned && raw.schedule) {
        return { assigned: true, schedule: raw.schedule, location: raw.location };
    }
    return { assigned: false, schedule: null, location: null };
}
```

기존 `submitApplication` 메서드는 별도 task (Task 6) 에서 body 확장.

- [ ] **Step 5: packages/api/test/interview.test.ts 작성 (MSW)**

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createDuingApiClient } from '../src/client';

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = createDuingApiClient('http://localhost:8080/api/v1');

describe('Interview API client', () => {
    it('getMyInterviewSchedule assigned=false 응답을 narrow union 으로 변환한다', async () => {
        server.use(http.get('*/applications/100/interview-schedule', () =>
            HttpResponse.json({ data: { assigned: false, schedule: null, location: null } })));

        const result = await client.getMyInterviewSchedule(100);
        expect(result.assigned).toBe(false);
        if (!result.assigned) {
            expect(result.schedule).toBeNull();
        }
    });

    it('getMyInterviewSchedule assigned=true 응답을 narrow union 으로 변환한다', async () => {
        server.use(http.get('*/applications/100/interview-schedule', () =>
            HttpResponse.json({ data: {
                assigned: true,
                schedule: { scheduleId: 1, slotId: 1, startTime: 't', endTime: 't', status: 'ASSIGNED', assignedAt: 't' },
                location: '공학관 2201호'
            } })));

        const result = await client.getMyInterviewSchedule(100);
        expect(result.assigned).toBe(true);
        if (result.assigned) {
            expect(result.schedule.scheduleId).toBe(1);
            expect(result.location).toBe('공학관 2201호');
        }
    });

    it('createInterviewSlots 는 정확한 URL + body 로 POST 한다', async () => {
        let captured: any = null;
        server.use(http.post('*/recruitments/10/interview-slots', async ({ request }) => {
            captured = await request.json();
            return HttpResponse.json({ data: { slotIds: [101, 102] } });
        }));

        const result = await client.createInterviewSlots(10, {
            slots: [{ startTime: 't', endTime: 't2', capacity: 2 }]
        });
        expect(captured).toEqual({ slots: [{ startTime: 't', endTime: 't2', capacity: 2 }] });
        expect(result.slotIds).toEqual([101, 102]);
    });

    it('updateInterviewConfig 는 location 만 부분 전송 가능', async () => {
        let captured: any = null;
        server.use(http.patch('*/recruitments/10/interview-config', async ({ request }) => {
            captured = await request.json();
            return new HttpResponse(null, { status: 204 });
        }));

        await client.updateInterviewConfig(10, { location: '공학관 2201호' });
        expect(captured).toEqual({ location: '공학관 2201호' });
    });
});
```

- [ ] **Step 6: packages/hooks/src/interviewQueryKeys.ts**

```ts
export const interviewQueryKeys = {
    all: ['interview'] as const,
    config: (rid: number) => [...interviewQueryKeys.all, 'config', rid] as const,
    slots: (rid: number) => [...interviewQueryKeys.all, 'slots', rid] as const,
    schedules: (rid: number) => [...interviewQueryKeys.all, 'schedules', rid] as const,
    candidates: (rid: number) => [...interviewQueryKeys.all, 'candidates', rid] as const,
    applicantSlots: (rid: number) => [...interviewQueryKeys.all, 'applicant-slots', rid] as const,
    availabilities: (appId: number) => [...interviewQueryKeys.all, 'availabilities', appId] as const,
    mySchedule: (appId: number) => [...interviewQueryKeys.all, 'my-schedule', appId] as const,
};
```

- [ ] **Step 7: packages/hooks/src/interview.ts**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiContext } from './api-context';
import { interviewQueryKeys } from './interviewQueryKeys';

// === Queries ===
export function useInterviewConfigQuery(recruitmentId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.config(recruitmentId),
        queryFn: () => api.getInterviewConfig(recruitmentId),
    });
}

export function useInterviewSlotsQuery(recruitmentId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.slots(recruitmentId),
        queryFn: () => api.getInterviewSlots(recruitmentId),
    });
}

export function useInterviewSchedulesQuery(recruitmentId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.schedules(recruitmentId),
        queryFn: () => api.getInterviewSchedules(recruitmentId),
    });
}

export function useMatchingCandidatesQuery(recruitmentId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.candidates(recruitmentId),
        queryFn: () => api.getMatchingCandidates(recruitmentId),
    });
}

export function useApplicantInterviewSlotsQuery(recruitmentId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.applicantSlots(recruitmentId),
        queryFn: () => api.getApplicantInterviewSlots(recruitmentId),
    });
}

export function useInterviewAvailabilitiesQuery(applicationId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.availabilities(applicationId),
        queryFn: () => api.getInterviewAvailabilities(applicationId),
    });
}

export function useMyInterviewScheduleQuery(applicationId: number) {
    const { api } = useApiContext();
    return useQuery({
        queryKey: interviewQueryKeys.mySchedule(applicationId),
        queryFn: () => api.getMyInterviewSchedule(applicationId),
    });
}

// === Mutations ===
export function useCreateInterviewConfigMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Parameters<typeof api.createInterviewConfig>[1]) =>
            api.createInterviewConfig(recruitmentId, body),
        onSuccess: () => qc.invalidateQueries({ queryKey: interviewQueryKeys.config(recruitmentId) }),
    });
}

export function useUpdateInterviewConfigMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Parameters<typeof api.updateInterviewConfig>[1]) =>
            api.updateInterviewConfig(recruitmentId, body),
        onSuccess: () => qc.invalidateQueries({ queryKey: interviewQueryKeys.config(recruitmentId) }),
    });
}

export function useCreateInterviewSlotsMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Parameters<typeof api.createInterviewSlots>[1]) =>
            api.createInterviewSlots(recruitmentId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.slots(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.candidates(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.applicantSlots(recruitmentId) });
        },
    });
}

export function useUpdateInterviewSlotMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (args: { slotId: number; body: Parameters<typeof api.updateInterviewSlot>[1] }) =>
            api.updateInterviewSlot(args.slotId, args.body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.slots(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.candidates(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.schedules(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.applicantSlots(recruitmentId) });
        },
    });
}

export function useDeleteInterviewSlotMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (slotId: number) => api.deleteInterviewSlot(slotId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.slots(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.candidates(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.schedules(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.applicantSlots(recruitmentId) });
        },
    });
}

export function useAutoAssignMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.autoAssignInterview(recruitmentId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.config(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.schedules(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.candidates(recruitmentId) });
        },
    });
}

export function useAssignInterviewScheduleMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (args: { applicationId: number; slotId: number }) =>
            api.assignInterviewSchedule(args.applicationId, { slotId: args.slotId }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.schedules(recruitmentId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.candidates(recruitmentId) });
        },
    });
}

export function useCancelInterviewScheduleMutation(recruitmentId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (applicationId: number) => api.cancelInterviewSchedule(applicationId),
        onSuccess: () => qc.invalidateQueries({ queryKey: interviewQueryKeys.schedules(recruitmentId) }),
    });
}

export function useUpdateInterviewAvailabilitiesMutation(applicationId: number) {
    const { api } = useApiContext();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: { slotIds: number[] }) =>
            api.updateInterviewAvailabilities(applicationId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: interviewQueryKeys.mySchedule(applicationId) });
            qc.invalidateQueries({ queryKey: interviewQueryKeys.availabilities(applicationId) });
        },
    });
}
```

`packages/hooks/src/index.ts` 에 export 추가.

- [ ] **Step 8: packages/hooks/test/interview.test.ts (invalidation 매트릭스 검증)**

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { ApiContextProvider } from '../src/api-context';
import { interviewQueryKeys } from '../src/interviewQueryKeys';
import {
    useCreateInterviewSlotsMutation, useInterviewSlotsQuery, useAutoAssignMutation
} from '../src/interview';

const server = setupServer();

function wrapper(qc: QueryClient) {
    return ({ children }: { children: React.ReactNode }) => (
        <ApiContextProvider baseUrl="http://localhost:8080/api/v1">
            <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        </ApiContextProvider>
    );
}

describe('useCreateInterviewSlotsMutation', () => {
    it('성공 시 slots/candidates/applicantSlots queryKey 가 invalidate 된다', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        server.use(http.post('*/recruitments/10/interview-slots', () =>
            HttpResponse.json({ data: { slotIds: [1, 2] } })));

        // 사전 query 시드
        qc.setQueryData(interviewQueryKeys.slots(10), []);
        qc.setQueryData(interviewQueryKeys.candidates(10), null);
        qc.setQueryData(interviewQueryKeys.applicantSlots(10), []);

        const { result } = renderHook(() => useCreateInterviewSlotsMutation(10), { wrapper: wrapper(qc) });
        result.current.mutate({ slots: [{ startTime: 't', endTime: 't2', capacity: 1 }] });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(qc.getQueryState(interviewQueryKeys.slots(10))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(interviewQueryKeys.applicantSlots(10))?.isInvalidated).toBe(true);
    });
});

describe('useAutoAssignMutation', () => {
    it('성공 시 config/schedules/candidates queryKey 가 invalidate 된다', async () => {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        server.use(http.post('*/recruitments/10/interview-schedules/auto-assign', () =>
            HttpResponse.json({ data: {
                totalCandidates: 2, assignedCount: 2,
                unassignedCount: 0, noAvailabilityCount: 0,
                assignmentCompletedAt: 't',
            } })));

        qc.setQueryData(interviewQueryKeys.config(10), null);
        qc.setQueryData(interviewQueryKeys.schedules(10), []);
        qc.setQueryData(interviewQueryKeys.candidates(10), null);

        const { result } = renderHook(() => useAutoAssignMutation(10), { wrapper: wrapper(qc) });
        result.current.mutate();
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(qc.getQueryState(interviewQueryKeys.config(10))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(interviewQueryKeys.schedules(10))?.isInvalidated).toBe(true);
        expect(qc.getQueryState(interviewQueryKeys.candidates(10))?.isInvalidated).toBe(true);
    });
});
```

`beforeAll`/`afterAll` 의 MSW 셋업은 vitest setup 파일 활용.

- [ ] **Step 9: packages/schemas/src/interview.ts**

```ts
import { z } from 'zod';

export const createInterviewConfigSchema = z.object({
    availabilityDeadline: z.string().datetime({ message: 'ISO 8601 형식이어야 합니다' }),
    location: z.string().trim().max(200, '면접 장소는 200자 이내여야 합니다').optional(),
});

export const updateInterviewConfigSchema = createInterviewConfigSchema.partial();

export const slotPatternSchema = z.object({
    startTime: z.string().datetime(),
    intervalMinutes: z.number().int().positive().max(240),
    count: z.number().int().min(1).max(50),
    capacity: z.number().int().min(1).max(20),
});

export const updateAvailabilitySchema = z.object({
    slotIds: z.array(z.number().int()).min(1, '최소 1개 이상 선택해야 합니다'),
});
```

`packages/schemas/src/index.ts` 에 export 추가.

- [ ] **Step 10: packages/schemas/test/interview.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import {
    createInterviewConfigSchema, slotPatternSchema, updateAvailabilitySchema
} from '../src/interview';

describe('createInterviewConfigSchema', () => {
    it('200자 초과 location 을 reject 한다', () => {
        const result = createInterviewConfigSchema.safeParse({
            availabilityDeadline: '2026-06-18T14:00:00Z',
            location: 'x'.repeat(201),
        });
        expect(result.success).toBe(false);
    });
    it('location 미포함도 허용 (optional)', () => {
        const result = createInterviewConfigSchema.safeParse({
            availabilityDeadline: '2026-06-18T14:00:00Z',
        });
        expect(result.success).toBe(true);
    });
});

describe('slotPatternSchema', () => {
    it('count=0 을 reject 한다', () => {
        expect(slotPatternSchema.safeParse({
            startTime: '2026-06-18T14:00:00Z',
            intervalMinutes: 30,
            count: 0,
            capacity: 1,
        }).success).toBe(false);
    });
});

describe('updateAvailabilitySchema', () => {
    it('빈 slotIds 를 reject 한다', () => {
        expect(updateAvailabilitySchema.safeParse({ slotIds: [] }).success).toBe(false);
    });
    it('1개 이상이면 통과', () => {
        expect(updateAvailabilitySchema.safeParse({ slotIds: [1] }).success).toBe(true);
    });
});
```

- [ ] **Step 11: 빌드 + 테스트 + lint + typecheck**

```bash
pnpm typecheck
pnpm test --filter @duing/api --filter @duing/hooks --filter @duing/schemas --filter @duing/types
```

모두 통과.

- [ ] **Step 12: Commit + Push + PR**

```bash
git add -A
git commit -m "feat(interview): packages 골격 — types + api + hooks + schemas (PR-FE0)"
git push -u origin feat/interview-fe0-packages
gh pr create --base develop --head feat/interview-fe0-packages \
  --title "feat(interview): packages 골격 — types/api/hooks/schemas (PR-FE0)" \
  --body "..."
```

---

## Task 3 (PR-FE1): 운영진 면접 라우트 + Stepper + ConfigSection

**전제:** Task 2 (PR-FE0) 머지 완료.

**목적:** spec §4 의 server-derived Stepper + Step 1 ConfigSection 구현. Step 2~4 는 disabled placeholder.

**Files:**
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/page.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_pages/InterviewManagementPage.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewProgressStepper.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewConfigSection.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/SectionPlaceholder.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_utils/deriveInterviewStep.ts`
- Test: `frontend/apps/web/test/manage/recruitments/interview/InterviewManagementPage.test.tsx`

- [ ] **Step 1: 브랜치 + page.tsx (Server Component)**

```bash
git checkout develop && git pull --ff-only
git checkout -b feat/interview-fe1-config
```

`page.tsx`:

```tsx
import { InterviewManagementPage } from './_pages/InterviewManagementPage';

type Params = { clubId: string; recruitmentId: string };

export default async function Page({ params }: { params: Promise<Params> }) {
    const { clubId, recruitmentId } = await params;
    return (
        <InterviewManagementPage
            clubId={Number(clubId)}
            recruitmentId={Number(recruitmentId)}
        />
    );
}
```

- [ ] **Step 2: deriveInterviewStep 유틸 + 테스트 작성 (TDD)**

`_utils/deriveInterviewStep.ts` 신규:

```ts
import type { InterviewConfig, SlotListView } from '@duing/types';

export type InterviewStep = 1 | 2 | 3 | 4;

export function deriveInterviewStep(args: {
    config: InterviewConfig | null;
    slots: SlotListView[];
    now?: Date;
}): InterviewStep {
    const { config, slots, now = new Date() } = args;

    if (!config) return 1;
    if (config.assignmentCompletedAt) return 4;
    if (slots.length === 0) return 2;

    const deadline = new Date(config.availabilityDeadline);
    if (now < deadline) return 2;
    return 3;
}
```

`test/manage/recruitments/interview/deriveInterviewStep.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveInterviewStep } from '../../../../app/manage/clubs/.../deriveInterviewStep';

describe('deriveInterviewStep', () => {
    const baseConfig = {
        configId: 1, availabilityDeadline: '2026-06-18T14:00:00Z',
        assignmentCompletedAt: null, location: null,
    };

    it('config 없으면 1', () => {
        expect(deriveInterviewStep({ config: null, slots: [] })).toBe(1);
    });
    it('config 있고 slots 0 이면 2', () => {
        expect(deriveInterviewStep({ config: baseConfig, slots: [] })).toBe(2);
    });
    it('config 있고 slots 있고 deadline 전이면 2', () => {
        expect(deriveInterviewStep({
            config: baseConfig,
            slots: [{ slotId: 1 } as any],
            now: new Date('2026-06-17T14:00:00Z'),
        })).toBe(2);
    });
    it('config 있고 slots 있고 deadline 후이면 3', () => {
        expect(deriveInterviewStep({
            config: baseConfig,
            slots: [{ slotId: 1 } as any],
            now: new Date('2026-06-19T14:00:00Z'),
        })).toBe(3);
    });
    it('assignmentCompletedAt 있으면 4', () => {
        expect(deriveInterviewStep({
            config: { ...baseConfig, assignmentCompletedAt: '2026-06-19T15:00:00Z' },
            slots: [{ slotId: 1 } as any],
        })).toBe(4);
    });
});
```

```bash
pnpm test --filter @duing/web -- deriveInterviewStep
```
5 시나리오 모두 통과.

- [ ] **Step 3: SectionPlaceholder (disabled section 시각)**

```tsx
// _components/SectionPlaceholder.tsx
type Props = { stepNumber: number; title: string; reason: string };
export function SectionPlaceholder({ stepNumber, title, reason }: Props) {
    return (
        <section className="rounded border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-400">Step {stepNumber} · {title}</h2>
            <p className="mt-2 text-sm text-gray-400">{reason}</p>
        </section>
    );
}
```

- [ ] **Step 4: InterviewProgressStepper**

```tsx
// _components/InterviewProgressStepper.tsx
import type { InterviewStep } from '../_utils/deriveInterviewStep';

type Props = { currentStep: InterviewStep };
const LABELS = ['면접 설정', '슬롯 관리', '자동 배정', '일정 관리'];

export function InterviewProgressStepper({ currentStep }: Props) {
    return (
        <ol className="flex items-center gap-3">
            {LABELS.map((label, idx) => {
                const step = (idx + 1) as InterviewStep;
                const isActive = step === currentStep;
                const isPast = step < currentStep;
                return (
                    <li
                        key={step}
                        aria-current={isActive ? 'step' : undefined}
                        className={[
                            'flex items-center gap-2 rounded px-3 py-1',
                            isActive && 'bg-blue-100 font-semibold text-blue-800',
                            isPast && 'text-gray-600',
                            !isActive && !isPast && 'text-gray-400',
                        ].filter(Boolean).join(' ')}
                    >
                        <span className="text-sm">{step}</span>
                        <span>{label}</span>
                    </li>
                );
            })}
        </ol>
    );
}
```

- [ ] **Step 5: InterviewConfigSection**

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createInterviewConfigSchema, updateInterviewConfigSchema } from '@duing/schemas';
import {
    useInterviewConfigQuery, useCreateInterviewConfigMutation,
    useUpdateInterviewConfigMutation,
} from '@duing/hooks';

type Props = { recruitmentId: number };

type FormShape = {
    availabilityDeadline: string;
    location?: string;
};

export function InterviewConfigSection({ recruitmentId }: Props) {
    const configQuery = useInterviewConfigQuery(recruitmentId);
    const config = configQuery.data;
    const isEditing = !!config;

    const { register, handleSubmit, formState } = useForm<FormShape>({
        resolver: zodResolver(isEditing ? updateInterviewConfigSchema : createInterviewConfigSchema),
        defaultValues: {
            availabilityDeadline: config?.availabilityDeadline ?? '',
            location: config?.location ?? '',
        },
    });

    const createMutation = useCreateInterviewConfigMutation(recruitmentId);
    const updateMutation = useUpdateInterviewConfigMutation(recruitmentId);

    const onSubmit = handleSubmit((values) => {
        const body = {
            availabilityDeadline: values.availabilityDeadline,
            // 빈 input 이면 location 자체 omit
            ...(values.location && values.location.trim() ? { location: values.location.trim() } : {}),
        };
        if (isEditing) {
            updateMutation.mutate(body);
        } else {
            createMutation.mutate(body);
        }
    });

    if (configQuery.isLoading) return <section>불러오는 중…</section>;

    return (
        <section className="rounded border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Step 1 · 면접 설정</h2>
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
                <div>
                    <label className="block text-sm font-medium">면접 가능시간 제출 마감</label>
                    <input
                        type="datetime-local"
                        {...register('availabilityDeadline')}
                        className="mt-1 w-full rounded border px-3 py-2"
                    />
                    {formState.errors.availabilityDeadline && (
                        <p className="text-xs text-red-600">{formState.errors.availabilityDeadline.message}</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium">면접 장소</label>
                    <input
                        type="text"
                        maxLength={200}
                        placeholder="예: 공학관 2201호"
                        {...register('location')}
                        className="mt-1 w-full rounded border px-3 py-2"
                    />
                    <p className="mt-1 text-xs text-gray-500">비워두면 추후 안내됩니다.</p>
                    {formState.errors.location && (
                        <p className="text-xs text-red-600">{formState.errors.location.message}</p>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="rounded bg-blue-600 px-4 py-2 text-white"
                >
                    {isEditing ? '저장' : '면접 설정 활성화'}
                </button>
            </form>
        </section>
    );
}
```

- [ ] **Step 6: InterviewManagementPage**

```tsx
'use client';

import { useInterviewConfigQuery, useInterviewSlotsQuery } from '@duing/hooks';
import { deriveInterviewStep } from '../_utils/deriveInterviewStep';
import { InterviewProgressStepper } from '../_components/InterviewProgressStepper';
import { InterviewConfigSection } from '../_components/InterviewConfigSection';
import { SectionPlaceholder } from '../_components/SectionPlaceholder';

type Props = { clubId: number; recruitmentId: number };

export function InterviewManagementPage({ recruitmentId }: Props) {
    const configQuery = useInterviewConfigQuery(recruitmentId);
    const slotsQuery = useInterviewSlotsQuery(recruitmentId);

    if (configQuery.isLoading || slotsQuery.isLoading) {
        return <main>불러오는 중…</main>;
    }

    const currentStep = deriveInterviewStep({
        config: configQuery.data ?? null,
        slots: slotsQuery.data ?? [],
    });

    return (
        <main className="space-y-6 p-6">
            <h1 className="text-2xl font-bold">면접 관리</h1>
            <InterviewProgressStepper currentStep={currentStep} />

            <InterviewConfigSection recruitmentId={recruitmentId} />

            {currentStep >= 2 ? (
                <SectionPlaceholder stepNumber={2} title="슬롯 관리" reason="PR-FE2 에서 추가됩니다." />
            ) : (
                <SectionPlaceholder stepNumber={2} title="슬롯 관리" reason="이전 단계 완료 후 이용 가능합니다." />
            )}
            <SectionPlaceholder stepNumber={3} title="자동 배정" reason="PR-FE3 에서 추가됩니다." />
            <SectionPlaceholder stepNumber={4} title="일정 관리" reason="PR-FE3 에서 추가됩니다." />
        </main>
    );
}
```

- [ ] **Step 7: 통합 테스트 — Stepper 자동 단계 결정**

`test/manage/recruitments/interview/InterviewManagementPage.test.tsx`:

```tsx
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { InterviewManagementPage } from '../../../../app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_pages/InterviewManagementPage';
import { ApiContextProvider } from '@duing/hooks';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <ApiContextProvider baseUrl="http://localhost:8080/api/v1">
            <QueryClientProvider client={qc}>
                <InterviewManagementPage clubId={1} recruitmentId={10} />
            </QueryClientProvider>
        </ApiContextProvider>
    );
}

describe('InterviewManagementPage — 자동 단계 결정', () => {
    it('config 가 없으면 Step 1 active', async () => {
        server.use(
            http.get('*/recruitments/10/interview-config', () => new HttpResponse(null, { status: 404 })),
            http.get('*/recruitments/10/interview-slots', () => HttpResponse.json({ data: [] }))
        );
        setup();
        const step1 = await screen.findByText('면접 설정', { selector: '[aria-current="step"] *' });
        expect(step1).toBeInTheDocument();
    });

    it('assignmentCompletedAt 있으면 Step 4 active', async () => {
        server.use(
            http.get('*/recruitments/10/interview-config', () => HttpResponse.json({
                data: {
                    configId: 1,
                    availabilityDeadline: '2026-06-18T14:00:00Z',
                    assignmentCompletedAt: '2026-06-19T10:00:00Z',
                    location: '공학관 2201호',
                },
            })),
            http.get('*/recruitments/10/interview-slots', () => HttpResponse.json({
                data: [{ slotId: 1, startTime: 't', endTime: 't', capacity: 2,
                         availabilityCount: 0, assignedCount: 0 }],
            }))
        );
        setup();
        const step4 = await screen.findByText('일정 관리', { selector: '[aria-current="step"] *' });
        expect(step4).toBeInTheDocument();
    });
});
```

`pnpm test --filter @duing/web -- InterviewManagementPage` 통과.

- [ ] **Step 8: lint + typecheck + commit + push + PR**

```bash
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(manage): 면접 관리 라우트 + Stepper + Step 1 ConfigSection (PR-FE1)"
git push -u origin feat/interview-fe1-config
gh pr create --base develop --head feat/interview-fe1-config --title "..." --body "..."
```

---

## Task 4 (PR-FE2): 운영진 InterviewSlotSection + ManagementSlotCard

**전제:** Task 3 (PR-FE1) 머지 완료.

**목적:** spec §4.5 의 SlotSection — 패턴 입력 + 미리보기 + 슬롯 그리드 + M3/M5/M6 mutation.

**Files:**
- Create: `frontend/apps/web/components/interview/ManagementSlotCard.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewSlotSection.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/SlotPatternForm.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/SlotPreviewList.tsx`
- Create: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_utils/generateSlotsFromPattern.ts`
- Modify: InterviewManagementPage.tsx (SlotSection 활성화)
- Test: 각 컴포넌트 단위 + 통합

- [ ] **Step 1: 브랜치 + generateSlotsFromPattern 유틸 (TDD)**

```ts
// _utils/generateSlotsFromPattern.ts
export type SlotEntry = { startTime: string; endTime: string; capacity: number };

export function generateSlotsFromPattern(args: {
    startTime: string;        // ISO
    intervalMinutes: number;
    count: number;
    capacity: number;
    slotDurationMinutes?: number;  // default = intervalMinutes
}): SlotEntry[] {
    const { startTime, intervalMinutes, count, capacity,
            slotDurationMinutes = intervalMinutes } = args;
    const baseDate = new Date(startTime);
    const result: SlotEntry[] = [];
    for (let i = 0; i < count; i++) {
        const start = new Date(baseDate.getTime() + i * intervalMinutes * 60_000);
        const end = new Date(start.getTime() + slotDurationMinutes * 60_000);
        result.push({
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            capacity,
        });
    }
    return result;
}
```

테스트:

```ts
describe('generateSlotsFromPattern', () => {
    it('startTime 부터 interval 간격으로 count 개 생성', () => {
        const slots = generateSlotsFromPattern({
            startTime: '2026-06-18T18:00:00Z',
            intervalMinutes: 30,
            count: 4,
            capacity: 2,
        });
        expect(slots).toHaveLength(4);
        expect(slots[0].startTime).toBe('2026-06-18T18:00:00.000Z');
        expect(slots[1].startTime).toBe('2026-06-18T18:30:00.000Z');
        expect(slots[3].startTime).toBe('2026-06-18T19:30:00.000Z');
        expect(slots[0].capacity).toBe(2);
    });
    it('slot duration 이 interval 과 다르면 그 길이만큼 endTime', () => {
        const slots = generateSlotsFromPattern({
            startTime: '2026-06-18T18:00:00Z',
            intervalMinutes: 30,
            count: 2,
            capacity: 1,
            slotDurationMinutes: 20,
        });
        expect(slots[0].endTime).toBe('2026-06-18T18:20:00.000Z');
    });
});
```

- [ ] **Step 2: SlotPatternForm 컴포넌트**

```tsx
'use client';
import { useState } from 'react';
import { generateSlotsFromPattern, SlotEntry } from '../_utils/generateSlotsFromPattern';

type Props = { onPreview: (slots: SlotEntry[]) => void; disabled?: boolean };

export function SlotPatternForm({ onPreview, disabled }: Props) {
    const [startTime, setStartTime] = useState('');
    const [intervalMinutes, setInterval_] = useState(30);
    const [count, setCount] = useState(6);
    const [capacity, setCapacity] = useState(2);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!startTime) return;
                onPreview(generateSlotsFromPattern({ startTime, intervalMinutes, count, capacity }));
            }}
            className="space-y-3"
        >
            <fieldset disabled={disabled} className="grid grid-cols-4 gap-2">
                <input type="datetime-local" value={startTime}
                       onChange={(e) => setStartTime(e.target.value)} required
                       className="rounded border px-2 py-1" />
                <input type="number" min={5} max={240} value={intervalMinutes}
                       onChange={(e) => setInterval_(Number(e.target.value))}
                       className="rounded border px-2 py-1" />
                <input type="number" min={1} max={50} value={count}
                       onChange={(e) => setCount(Number(e.target.value))}
                       className="rounded border px-2 py-1" />
                <input type="number" min={1} max={20} value={capacity}
                       onChange={(e) => setCapacity(Number(e.target.value))}
                       className="rounded border px-2 py-1" />
            </fieldset>
            <button type="submit" disabled={disabled}
                    className="rounded bg-gray-700 px-4 py-2 text-white">
                + 미리보기
            </button>
        </form>
    );
}
```

- [ ] **Step 3: SlotPreviewList — 개별 삭제 가능**

```tsx
'use client';
type Props = { slots: SlotEntry[]; onRemove: (idx: number) => void };
export function SlotPreviewList({ slots, onRemove }: Props) {
    return (
        <ul className="grid grid-cols-2 gap-2">
            {slots.map((slot, idx) => (
                <li key={idx} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <span>{slot.startTime} · {slot.capacity}명</span>
                    <button type="button" onClick={() => onRemove(idx)} aria-label="삭제">×</button>
                </li>
            ))}
        </ul>
    );
}
```

- [ ] **Step 4: ManagementSlotCard (공용 컴포넌트)**

```tsx
// apps/web/components/interview/ManagementSlotCard.tsx
'use client';
import type { ManagementSlotView } from '@duing/types';

type Props = {
    slot: ManagementSlotView;
    onAssign?: (slotId: number) => void;
    onMove?: (applicationId: number, fromSlotId: number) => void;
    onCancel?: (applicationId: number) => void;
};

export function ManagementSlotCard({ slot, onAssign, onMove, onCancel }: Props) {
    const assignedCount = slot.assignments?.length ?? 0;
    const remaining = slot.capacity - assignedCount;

    return (
        <article className="rounded border bg-white p-3">
            <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{formatRange(slot.startTime, slot.endTime)}</h3>
                <span className="text-xs text-gray-500">
                    {assignedCount}/{slot.capacity}명
                    {slot.availabilityCount !== undefined && ` · 신청 ${slot.availabilityCount}명`}
                </span>
            </header>
            {slot.assignments && (
                <ul className="mt-2 space-y-1">
                    {slot.assignments.map((a) => (
                        <li key={a.scheduleId} className="flex items-center justify-between text-sm">
                            <span>{a.applicantLabel}</span>
                            <span className="flex gap-1">
                                {onMove && <button onClick={() => onMove(a.applicationId, slot.slotId)} className="text-xs underline">이동</button>}
                                {onCancel && <button onClick={() => onCancel(a.applicationId)} className="text-xs text-red-600 underline">취소</button>}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {onAssign && remaining > 0 && (
                <button onClick={() => onAssign(slot.slotId)} className="mt-2 w-full rounded bg-gray-100 py-1 text-sm">
                    + 지원자 배정
                </button>
            )}
        </article>
    );
}

function formatRange(start: string, end: string) {
    const s = new Date(start), e = new Date(end);
    return `${s.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` +
           ` ~ ${e.toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}
```

- [ ] **Step 5: InterviewSlotSection — 패턴 + 미리보기 + 그리드**

```tsx
'use client';
import { useState } from 'react';
import { useInterviewSlotsQuery, useCreateInterviewSlotsMutation,
         useDeleteInterviewSlotMutation, useUpdateInterviewSlotMutation } from '@duing/hooks';
import { ManagementSlotCard } from '@/components/interview/ManagementSlotCard';
import { SlotPatternForm } from './SlotPatternForm';
import { SlotPreviewList } from './SlotPreviewList';
import type { SlotEntry } from '../_utils/generateSlotsFromPattern';
import type { ManagementSlotView } from '@duing/types';

type Props = { recruitmentId: number; recruitmentStartDate: string };

export function InterviewSlotSection({ recruitmentId, recruitmentStartDate }: Props) {
    const slotsQuery = useInterviewSlotsQuery(recruitmentId);
    const createMutation = useCreateInterviewSlotsMutation(recruitmentId);
    const deleteMutation = useDeleteInterviewSlotMutation(recruitmentId);
    const [preview, setPreview] = useState<SlotEntry[]>([]);

    const startDate = new Date(recruitmentStartDate);
    const recruitmentStarted = new Date() >= startDate;

    const handleSave = () => {
        createMutation.mutate({ slots: preview }, {
            onSuccess: () => setPreview([]),
        });
    };

    const views: ManagementSlotView[] = (slotsQuery.data ?? []).map((s) => ({
        slotId: s.slotId, startTime: s.startTime, endTime: s.endTime,
        capacity: s.capacity, availabilityCount: s.availabilityCount,
    }));

    return (
        <section className="rounded border bg-white p-6">
            <h2 className="text-lg font-semibold">Step 2 · 슬롯 관리</h2>
            {recruitmentStarted ? (
                <p className="mt-2 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
                    모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다.
                </p>
            ) : (
                <div className="mt-4 space-y-3">
                    <SlotPatternForm onPreview={setPreview} disabled={recruitmentStarted} />
                    {preview.length > 0 && (
                        <>
                            <SlotPreviewList slots={preview} onRemove={(i) =>
                                setPreview(preview.filter((_, idx) => idx !== i))} />
                            <button onClick={handleSave}
                                    disabled={createMutation.isPending}
                                    className="rounded bg-blue-600 px-4 py-2 text-white">
                                저장
                            </button>
                        </>
                    )}
                </div>
            )}

            <div className="mt-6">
                <h3 className="text-sm font-medium">현재 슬롯</h3>
                <div className="mt-2 grid grid-cols-3 gap-3">
                    {views.map((view) => (
                        <ManagementSlotCard
                            key={view.slotId}
                            slot={view}
                            onCancel={() => deleteMutation.mutate(view.slotId)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
```

- [ ] **Step 6: InterviewManagementPage 갱신 — Step 2 활성화**

```tsx
// 기존 SectionPlaceholder Step 2 → InterviewSlotSection 으로 교체
{currentStep >= 2 ? (
    <InterviewSlotSection
        recruitmentId={recruitmentId}
        recruitmentStartDate={recruitment.startDate}
    />
) : (
    <SectionPlaceholder stepNumber={2} title="슬롯 관리"
                        reason="이전 단계 완료 후 이용 가능합니다." />
)}
```

`recruitment.startDate` 는 `useRecruitmentDetailQuery` 로 받아옴 (props 전달).

- [ ] **Step 7: 통합 테스트 시나리오**

```
✅ "패턴 입력 후 미리보기 누르면 슬롯 N개 표시"
✅ "미리보기 행 × 누르면 1 개 줄어든다"
✅ "저장 성공 후 미리보기 영역이 비워지고 그리드에 슬롯이 추가된다"
✅ "recruitment.startDate 가 과거이면 패턴 입력 영역이 disabled + 안내 메시지"
```

- [ ] **Step 8: lint + typecheck + commit + push + PR**

```bash
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(manage): Step 2 SlotSection + ManagementSlotCard 공용 (PR-FE2)"
git push -u origin feat/interview-fe2-slots
gh pr create --base develop --head feat/interview-fe2-slots --title "..." --body "..."
```

---

## Task 5 (PR-FE3): 운영진 AutoAssign + ScheduleManagement Sections

**전제:** Task 4 머지.

**목적:** spec §4.5 의 Step 3 (dry-run 5 지표 + 실행) + Step 4 (일정 그리드 + 수동 조정 + location banner + 2 tab).

**Files:**
- Create: `_components/InterviewAutoAssignSection.tsx`
- Create: `_components/InterviewScheduleManagementSection.tsx`
- Create: `_components/AssignToSlotModal.tsx` (수동 배정 모달)
- Create: `_utils/calculateDryRunStats.ts`
- Modify: InterviewManagementPage.tsx (Step 3, 4 활성화)

- [ ] **Step 1: calculateDryRunStats 유틸 (TDD) — spec §4.5 의 5 지표 계산**

```ts
import type { MatchingCandidatesView } from '@duing/types';

export type DryRunStats = {
    totalCandidates: number;
    totalCapacity: number;
    expectedAssigned: number;
    expectedUnassigned: number;
    noAvailabilityCount: number;
};

export function calculateDryRunStats(candidates: MatchingCandidatesView): DryRunStats {
    const totalCapacity = candidates.slots.reduce(
        (sum, s) => sum + (s.capacity - s.alreadyAssignedCount), 0);
    const expectedAssigned = Math.min(candidates.candidatesWithAvailability, totalCapacity);
    const expectedUnassigned = Math.max(0, candidates.candidatesWithAvailability - totalCapacity);
    return {
        totalCandidates: candidates.totalCandidates,
        totalCapacity,
        expectedAssigned,
        expectedUnassigned,
        noAvailabilityCount: candidates.candidatesWithoutAvailability,
    };
}
```

테스트 4 시나리오 (capacity 충분, 부족, 0, 모든 후보가 availability 없음).

- [ ] **Step 2: InterviewAutoAssignSection**

```tsx
'use client';
import { useMatchingCandidatesQuery, useAutoAssignMutation } from '@duing/hooks';
import { calculateDryRunStats } from '../_utils/calculateDryRunStats';

export function InterviewAutoAssignSection({ recruitmentId }: { recruitmentId: number }) {
    const candidatesQuery = useMatchingCandidatesQuery(recruitmentId);
    const autoAssignMutation = useAutoAssignMutation(recruitmentId);

    if (candidatesQuery.isLoading) return <section>불러오는 중…</section>;
    if (!candidatesQuery.data) return null;

    const stats = calculateDryRunStats(candidatesQuery.data);

    return (
        <section className="rounded border bg-white p-6">
            <h2 className="text-lg font-semibold">Step 3 · 자동 배정</h2>
            <div className="mt-4 grid grid-cols-5 gap-3 text-sm">
                <Stat label="총 후보자" value={`${stats.totalCandidates}명`} />
                <Stat label="총 Capacity" value={`${stats.totalCapacity}명`} />
                <Stat label="예상 배정 (추정)" value={`${stats.expectedAssigned}명`} />
                <Stat label="예상 미배정 (추정)" value={`${stats.expectedUnassigned}명`} />
                <Stat label="가능시간 미제출" value={`${stats.noAvailabilityCount}명`} />
            </div>

            <button
                onClick={() => {
                    if (confirm('자동 배정을 실행하시겠습니까? 1회만 실행 가능합니다.')) {
                        autoAssignMutation.mutate();
                    }
                }}
                disabled={autoAssignMutation.isPending}
                className="mt-4 rounded bg-blue-600 px-6 py-2 text-white"
            >
                자동 배정 실행
            </button>

            {autoAssignMutation.isError && (
                <p className="mt-2 text-sm text-red-600">
                    실행 실패: {(autoAssignMutation.error as Error).message}
                </p>
            )}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded bg-gray-50 p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
    );
}
```

- [ ] **Step 3: AssignToSlotModal — 수동 배정 모달**

```tsx
'use client';
import { useInterviewSlotsQuery, useAssignInterviewScheduleMutation } from '@duing/hooks';

type Props = {
    isOpen: boolean;
    applicationId: number | null;
    recruitmentId: number;
    onClose: () => void;
};

export function AssignToSlotModal({ isOpen, applicationId, recruitmentId, onClose }: Props) {
    const slotsQuery = useInterviewSlotsQuery(recruitmentId);
    const assignMutation = useAssignInterviewScheduleMutation(recruitmentId);

    if (!isOpen || !applicationId) return null;

    return (
        <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
            <div className="w-96 rounded bg-white p-6">
                <h3 className="text-lg font-semibold">슬롯 선택</h3>
                <ul className="mt-4 space-y-1">
                    {slotsQuery.data?.map((slot) => (
                        <li key={slot.slotId}>
                            <button
                                onClick={() => assignMutation.mutate(
                                    { applicationId, slotId: slot.slotId },
                                    { onSuccess: onClose }
                                )}
                                disabled={slot.assignedCount >= slot.capacity}
                                className="w-full rounded bg-gray-50 p-2 text-left text-sm disabled:opacity-50"
                            >
                                {slot.startTime} · {slot.assignedCount}/{slot.capacity}명
                            </button>
                        </li>
                    ))}
                </ul>
                <button onClick={onClose} className="mt-4 rounded border px-4 py-2">취소</button>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: InterviewScheduleManagementSection — banner + 2 tab + 그리드**

```tsx
'use client';
import { useState } from 'react';
import {
    useInterviewSchedulesQuery, useInterviewConfigQuery,
    useCancelInterviewScheduleMutation
} from '@duing/hooks';
import { ManagementSlotCard } from '@/components/interview/ManagementSlotCard';
import { AssignToSlotModal } from './AssignToSlotModal';
import type { ManagementSlotView } from '@duing/types';

type Tab = 'all' | 'by-slot';

export function InterviewScheduleManagementSection({ recruitmentId }: { recruitmentId: number }) {
    const schedulesQuery = useInterviewSchedulesQuery(recruitmentId);
    const configQuery = useInterviewConfigQuery(recruitmentId);
    const cancelMutation = useCancelInterviewScheduleMutation(recruitmentId);

    const [tab, setTab] = useState<Tab>('by-slot');
    const [assignTarget, setAssignTarget] = useState<number | null>(null);

    if (schedulesQuery.isLoading) return <section>불러오는 중…</section>;

    const views: ManagementSlotView[] = (schedulesQuery.data ?? []).map((row) => ({
        slotId: row.slotId, startTime: row.startTime, endTime: row.endTime,
        capacity: row.capacity,
        assignments: row.assigned.map((a) => ({
            scheduleId: a.scheduleId,
            applicationId: a.applicationId,
            applicantLabel: `지원자 #${a.applicationId}`,    // 실제 이름은 별도 query 필요 — phase 2
            status: a.status,
        })),
    }));

    return (
        <section className="rounded border bg-white p-6">
            <h2 className="text-lg font-semibold">Step 4 · 일정 관리</h2>

            {configQuery.data?.location && (
                <p className="mt-2 rounded bg-blue-50 p-3 text-sm">
                    면접 장소: <strong>{configQuery.data.location}</strong>
                </p>
            )}

            <div className="mt-4 flex gap-2 border-b">
                <button onClick={() => setTab('all')}
                        className={tab === 'all' ? 'border-b-2 border-blue-600 pb-1' : 'pb-1 text-gray-500'}>
                    전체 일정
                </button>
                <button onClick={() => setTab('by-slot')}
                        className={tab === 'by-slot' ? 'border-b-2 border-blue-600 pb-1' : 'pb-1 text-gray-500'}>
                    슬롯별 보기
                </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
                {views.map((view) => (
                    <ManagementSlotCard
                        key={view.slotId}
                        slot={view}
                        onAssign={(slotId) => setAssignTarget(slotId)}
                        onCancel={(applicationId) => cancelMutation.mutate(applicationId)}
                    />
                ))}
            </div>

            <AssignToSlotModal
                isOpen={assignTarget !== null}
                applicationId={assignTarget}
                recruitmentId={recruitmentId}
                onClose={() => setAssignTarget(null)}
            />
        </section>
    );
}
```

- [ ] **Step 5: InterviewManagementPage 갱신 — Step 3/4 활성화**

기존 placeholder 두 개를 위 두 컴포넌트로 교체. derivedStep 에 따라 disabled placeholder 또는 actual component.

- [ ] **Step 6: 통합 테스트**

```
✅ "candidates 응답에서 5 지표가 정확히 계산되어 표시된다"
✅ "자동 배정 실행 버튼 클릭 후 invalidation 매트릭스 통과"
✅ "config.location 이 있으면 banner 표시"
✅ "config.location 이 null 이면 banner 숨김"
✅ "ScheduleListView 의 assigned chip 이 표시되고 onCancel 클릭 시 mutation 호출"
```

- [ ] **Step 7: commit + push + PR**

```bash
pnpm typecheck && pnpm lint
git add -A
git commit -m "feat(manage): Step 3 AutoAssign + Step 4 ScheduleManagement (PR-FE3)"
git push -u origin feat/interview-fe3-assign
gh pr create ...
```

---

## Task 6 (PR-FE4): 지원자 제출 폼 2-Step + 공용 picker

**전제:** Task 2 (PR-FE0) 머지. Task 3~5 와 병렬 가능.

**Files:**
- Create: `frontend/apps/web/components/interview/SlotPickerByDateGroup.tsx`
- Create: `frontend/apps/web/components/interview/ApplicantSlotItem.tsx`
- Create: `frontend/apps/web/app/apply/[recruitmentId]/_hooks/useSelectedSlotIds.ts`
- Create: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyAnswersStep.tsx`
- Create: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyInterviewSlotsStep.tsx`
- Create: `frontend/apps/web/app/apply/[recruitmentId]/_components/ApplyStepHeader.tsx`
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/page.tsx` (2-Step state 분기)
- Modify: `frontend/packages/api/src/client.ts` submitApplication body 확장
- Modify: `frontend/apps/web/app/apply/[recruitmentId]/_hooks/useAutosaveDraft.ts` 변경 없음 (확인)

### Step 1: ApplicantSlotItem + SlotPickerByDateGroup (공용)

```tsx
// apps/web/components/interview/ApplicantSlotItem.tsx
'use client';
import type { ApplicantInterviewSlot } from '@duing/types';

type Props = {
    slot: Pick<ApplicantInterviewSlot, 'slotId' | 'startTime' | 'endTime' | 'capacity'>;
    selected: boolean;
    onToggle: (slotId: number) => void;
    disabled?: boolean;
};

export function ApplicantSlotItem({ slot, selected, onToggle, disabled }: Props) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onToggle(slot.slotId)}
            className={[
                'rounded-full px-3 py-1 text-sm',
                selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700',
                disabled && 'opacity-50 cursor-not-allowed',
            ].filter(Boolean).join(' ')}
        >
            {formatTime(slot.startTime)}
        </button>
    );
}

function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}
```

```tsx
// apps/web/components/interview/SlotPickerByDateGroup.tsx
'use client';
import { useMemo } from 'react';
import type { ApplicantInterviewSlot } from '@duing/types';
import { ApplicantSlotItem } from './ApplicantSlotItem';

type Props = {
    slots: ApplicantInterviewSlot[];
    selectedSlotIds: number[];
    onChange: (slotIds: number[]) => void;
    disabled?: boolean;
    minSelected?: number;
};

export function SlotPickerByDateGroup({ slots, selectedSlotIds, onChange, disabled, minSelected = 1 }: Props) {
    const grouped = useMemo(() => groupByDate(slots), [slots]);
    const selectedSet = new Set(selectedSlotIds);

    const toggle = (slotId: number) => {
        const next = selectedSet.has(slotId)
            ? selectedSlotIds.filter((id) => id !== slotId)
            : [...selectedSlotIds, slotId];
        onChange(next);
    };

    const tooFew = selectedSlotIds.length < minSelected;

    return (
        <div className="space-y-4">
            {grouped.map(({ date, daySlots }) => (
                <div key={date}>
                    <h4 className="text-sm font-medium">{formatDate(date)}</h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {daySlots.map((slot) => (
                            <ApplicantSlotItem
                                key={slot.slotId}
                                slot={slot}
                                selected={selectedSet.has(slot.slotId)}
                                onToggle={toggle}
                                disabled={disabled}
                            />
                        ))}
                    </div>
                </div>
            ))}
            <p className={tooFew ? 'text-sm text-red-600' : 'text-sm text-gray-500'}>
                선택: <b>{selectedSlotIds.length}개</b>
                {tooFew && ` · 최소 ${minSelected}개 이상 필요`}
            </p>
        </div>
    );
}

function groupByDate(slots: ApplicantInterviewSlot[]) {
    const map = new Map<string, ApplicantInterviewSlot[]>();
    slots.forEach((s) => {
        const date = s.startTime.slice(0, 10);
        if (!map.has(date)) map.set(date, []);
        map.get(date)!.push(s);
    });
    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, daySlots]) => ({ date, daySlots }));
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}
```

### Step 2: 공용 컴포넌트 단위 테스트

```
✅ "selected 상태가 chip aria-pressed=true 로 표시된다"
✅ "chip 클릭 시 onChange 토글된 slotIds 호출"
✅ "disabled=true 면 onChange 호출 안 함"
✅ "minSelected=1, 0 선택 시 안내 메시지 표시"
✅ "날짜별 그룹화되어 렌더링"
```

### Step 3: useSelectedSlotIds hook

```ts
'use client';
import { useEffect, useState, useCallback } from 'react';

const KEY = (rid: number) => `apply:${rid}:slots`;

export function useSelectedSlotIds(recruitmentId: number) {
    const [slotIds, setSlotIds] = useState<number[]>([]);

    useEffect(() => {
        const raw = sessionStorage.getItem(KEY(recruitmentId));
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) setSlotIds(parsed);
            } catch { /* corrupt — ignore */ }
        }
    }, [recruitmentId]);

    const update = useCallback((next: number[]) => {
        setSlotIds(next);
        sessionStorage.setItem(KEY(recruitmentId), JSON.stringify(next));
    }, [recruitmentId]);

    const clear = useCallback(() => {
        setSlotIds([]);
        sessionStorage.removeItem(KEY(recruitmentId));
    }, [recruitmentId]);

    return { slotIds, setSlotIds: update, clear };
}
```

### Step 4: ApplyAnswersStep / ApplyInterviewSlotsStep / ApplyStepHeader

기존 page.tsx 의 답변 폼 UI 를 `ApplyAnswersStep` 으로 추출 (props 로 draft + onChange 받음).

`ApplyInterviewSlotsStep`:

```tsx
'use client';
import { useApplicantInterviewSlotsQuery, useRecruitmentDetailQuery } from '@duing/hooks';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';

type Props = {
    recruitmentId: number;
    selectedSlotIds: number[];
    onChange: (ids: number[]) => void;
};

export function ApplyInterviewSlotsStep({ recruitmentId, selectedSlotIds, onChange }: Props) {
    const slotsQuery = useApplicantInterviewSlotsQuery(recruitmentId);
    const detailQuery = useRecruitmentDetailQuery(recruitmentId);

    const deadline = detailQuery.data?.interviewAvailabilityDeadline;
    const deadlinePassed = deadline ? new Date() >= new Date(deadline) : false;

    if (slotsQuery.isLoading) return <section>불러오는 중…</section>;
    return (
        <section>
            <h2 className="text-lg font-semibold">Step 2 · 면접 가능시간 선택</h2>
            {deadlinePassed && (
                <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                    면접 가능시간 제출 기간이 종료되었습니다.
                </p>
            )}
            <div className="mt-4">
                <SlotPickerByDateGroup
                    slots={slotsQuery.data ?? []}
                    selectedSlotIds={selectedSlotIds}
                    onChange={onChange}
                    disabled={deadlinePassed}
                    minSelected={1}
                />
            </div>
        </section>
    );
}
```

`ApplyStepHeader`:

```tsx
type Props = { currentStep: 1 | 2; totalSteps: 1 | 2; onPrev?: () => void };
export function ApplyStepHeader({ currentStep, totalSteps, onPrev }: Props) {
    if (totalSteps === 1) return null;
    return (
        <header className="flex items-center gap-2">
            <span className="text-sm">Step {currentStep} / {totalSteps}</span>
            {onPrev && currentStep > 1 && (
                <button onClick={onPrev} className="text-sm underline">이전</button>
            )}
        </header>
    );
}
```

### Step 5: page.tsx 갱신 — 2-Step UI

기존 답변 폼 단일 흐름 → `useState<1|2>` 로 step 관리. `useInterview=false` 면 step 항상 1.

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRecruitmentDetailQuery, useSubmitApplicationMutation } from '@duing/hooks';
import { useAutosaveDraft } from './_hooks/useAutosaveDraft';
import { useSelectedSlotIds } from './_hooks/useSelectedSlotIds';
import { ApplyAnswersStep } from './_components/ApplyAnswersStep';
import { ApplyInterviewSlotsStep } from './_components/ApplyInterviewSlotsStep';
import { ApplyStepHeader } from './_components/ApplyStepHeader';

export default function ApplyPage({ params }: { params: Promise<{ recruitmentId: string }> }) {
    const router = useRouter();
    // ... use(params), useRecruitmentDetailQuery, useApplicationDraftQuery ...
    const { recruitmentId } = ...;
    const detail = useRecruitmentDetailQuery(recruitmentId);
    const recruitment = detail.data;
    const totalSteps = recruitment?.useInterview ? 2 : 1;
    const [step, setStep] = useState<1 | 2>(1);

    // 답변
    const { draft, save: saveDraft } = useAutosaveDraft(recruitmentId);

    // 슬롯
    const { slotIds, setSlotIds, clear: clearSlots } = useSelectedSlotIds(recruitmentId);

    const submitMutation = useSubmitApplicationMutation();

    const handleSubmit = () => {
        submitMutation.mutate({
            recruitmentId,
            body: {
                answers: draft.answers,
                ...(recruitment?.useInterview ? { interviewSlotIds: slotIds } : {}),
            },
        }, {
            onSuccess: (result) => {
                clearSlots();
                router.push(`/me/applications/${result.applicationId}`);
            },
        });
    };

    if (!recruitment) return null;

    return (
        <main className="space-y-4 p-6">
            <ApplyStepHeader
                currentStep={step}
                totalSteps={totalSteps}
                onPrev={() => setStep(1)}
            />

            {step === 1 && <ApplyAnswersStep draft={draft} onSave={saveDraft} />}

            {step === 2 && (
                <ApplyInterviewSlotsStep
                    recruitmentId={recruitmentId}
                    selectedSlotIds={slotIds}
                    onChange={setSlotIds}
                />
            )}

            <div className="flex justify-end gap-2">
                {step === 1 && totalSteps === 2 && (
                    <button onClick={() => setStep(2)} className="rounded bg-blue-600 px-4 py-2 text-white">
                        다음
                    </button>
                )}
                {(step === totalSteps) && (
                    <button
                        onClick={handleSubmit}
                        disabled={submitMutation.isPending || (recruitment.useInterview && slotIds.length === 0)}
                        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                    >
                        제출
                    </button>
                )}
            </div>
        </main>
    );
}
```

### Step 6: submitApplication body 확장

`packages/api/src/client.ts` 의 `submitApplication` 메서드 body 타입 갱신:

```ts
submitApplication(rid: number, body: {
    answers: Array<{ questionId: number; answer: string }>;
    interviewSlotIds?: number[];
}): Promise<{ applicationId: number }>;
```

### Step 7: 통합 테스트

```
✅ "useInterview=true 면 Step 1 → 다음 클릭 → Step 2 표시"
✅ "useInterview=false 면 다음 버튼 미표시, 제출 버튼 바로 노출"
✅ "Step 2 슬롯 0개면 제출 disabled"
✅ "deadline 경과 시 picker disabled + 안내"
✅ "Step 1 → Step 2 → Step 1 이동 시 답변·선택 보존"
✅ "제출 성공 시 me/applications/[id] navigate + sessionStorage clear"
✅ "409 AVAILABILITY_PERIOD_CLOSED 응답 시 toast + picker disable"
```

### Step 8: commit + push + PR

```bash
git add -A
git commit -m "feat(apply): 2-Step UI + SlotPicker + ApplicantSlotItem (PR-FE4)"
```

---

## Task 7 (PR-FE5): 지원자 InterviewScheduleCard + EditAvailabilityModal

**전제:** Task 6 (PR-FE4) 머지.

**Files:**
- Create: `frontend/apps/web/app/me/applications/[applicationId]/_components/InterviewScheduleCard.tsx`
- Create: `frontend/apps/web/app/me/applications/[applicationId]/_components/EditAvailabilityModal.tsx`
- Modify: `frontend/apps/web/app/me/applications/[applicationId]/_pages/...` (카드 삽입)

### Step 1: InterviewScheduleCard

```tsx
'use client';
import { useState } from 'react';
import { useMyInterviewScheduleQuery, useInterviewConfigQuery } from '@duing/hooks';
import { EditAvailabilityModal } from './EditAvailabilityModal';

type Props = { applicationId: number; recruitmentId: number };

export function InterviewScheduleCard({ applicationId, recruitmentId }: Props) {
    const scheduleQuery = useMyInterviewScheduleQuery(applicationId);
    const configQuery = useInterviewConfigQuery(recruitmentId);    // (deadline 확인용)
    const [editOpen, setEditOpen] = useState(false);

    if (scheduleQuery.isLoading) return <section>불러오는 중…</section>;
    if (!scheduleQuery.data) return null;

    const data = scheduleQuery.data;

    if (!data.assigned) {
        const deadline = configQuery.data?.availabilityDeadline;
        const completedAt = configQuery.data?.assignmentCompletedAt;
        const canEdit = deadline ? new Date() < new Date(deadline) : false;
        const canEditAndNotAssigned = canEdit && completedAt === null;

        return (
            <section className="rounded border bg-white p-4">
                <h3 className="font-semibold">면접 일정</h3>
                <p className="mt-2 text-sm text-gray-600">자동 배정 대기 중</p>
                {canEditAndNotAssigned && (
                    <button
                        onClick={() => setEditOpen(true)}
                        className="mt-3 rounded border px-3 py-1 text-sm"
                    >
                        가능시간 수정
                    </button>
                )}
                <EditAvailabilityModal
                    isOpen={editOpen}
                    onClose={() => setEditOpen(false)}
                    applicationId={applicationId}
                    recruitmentId={recruitmentId}
                />
            </section>
        );
    }

    return (
        <section className="rounded border bg-white p-4">
            <h3 className="font-semibold">면접 일정</h3>
            <p className="mt-2">{formatRange(data.schedule.startTime, data.schedule.endTime)}</p>
            {data.schedule.status === 'CANCELLED' && (
                <span className="mt-1 inline-block rounded bg-gray-200 px-2 py-0.5 text-xs">취소됨</span>
            )}

            <h4 className="mt-4 text-sm font-medium">면접 장소</h4>
            {data.location
                ? <p>{data.location}</p>
                : <p className="text-sm text-gray-500">장소는 추후 안내됩니다.</p>}
        </section>
    );
}

function formatRange(start: string, end: string) {
    const s = new Date(start), e = new Date(end);
    return `${s.toLocaleString('ko-KR')} ~ ${e.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}
```

### Step 2: EditAvailabilityModal

```tsx
'use client';
import { useState, useEffect } from 'react';
import {
    useInterviewAvailabilitiesQuery, useApplicantInterviewSlotsQuery,
    useUpdateInterviewAvailabilitiesMutation
} from '@duing/hooks';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    applicationId: number;
    recruitmentId: number;
};

export function EditAvailabilityModal({ isOpen, onClose, applicationId, recruitmentId }: Props) {
    const availQuery = useInterviewAvailabilitiesQuery(applicationId);
    const slotsQuery = useApplicantInterviewSlotsQuery(recruitmentId);
    const updateMutation = useUpdateInterviewAvailabilitiesMutation(applicationId);

    const [draft, setDraft] = useState<number[]>([]);

    useEffect(() => {
        if (isOpen && availQuery.data) {
            setDraft(availQuery.data.slotIds);
        }
    }, [isOpen, availQuery.data]);

    if (!isOpen) return null;

    const handleSave = () => {
        updateMutation.mutate({ slotIds: draft }, {
            onSuccess: onClose,
            onError: (err) => {
                const error = err as { response?: { status: number } };
                if (error.response?.status === 409) {
                    onClose();
                    alert('수정 기간이 종료되었거나 자동배정이 완료되었습니다.');
                }
            },
        });
    };

    return (
        <div role="dialog" className="fixed inset-0 flex items-center justify-center bg-black/50">
            <div className="w-[480px] max-w-full rounded bg-white p-6">
                <h3 className="text-lg font-semibold">면접 가능시간 수정</h3>
                {(availQuery.isLoading || slotsQuery.isLoading) ? (
                    <p>불러오는 중…</p>
                ) : (
                    <SlotPickerByDateGroup
                        slots={slotsQuery.data ?? []}
                        selectedSlotIds={draft}
                        onChange={setDraft}
                        minSelected={1}
                    />
                )}
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded border px-4 py-2">취소</button>
                    <button
                        onClick={handleSave}
                        disabled={updateMutation.isPending || draft.length === 0}
                        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
                    >
                        저장
                    </button>
                </div>
            </div>
        </div>
    );
}
```

### Step 3: me/applications 페이지에 카드 삽입

기존 페이지의 `_pages/...` 또는 `_components/...` 에 InterviewScheduleCard 추가. 위치는 Task 0 의 사전 확인 결과에 따라 결정.

### Step 4: 통합 테스트

```
✅ "assigned=false 일 때 '자동 배정 대기 중' 노출"
✅ "deadline 전이면 '가능시간 수정' 버튼 노출"
✅ "assigned=true, status=ASSIGNED, location 있으면 일정·장소 표시"
✅ "assigned=true, location=null 일 때 '장소는 추후 안내됩니다' fallback"
✅ "assigned=true, status=CANCELLED 시 '취소됨' 배지"
✅ "모달 진입 시 useInterviewAvailabilitiesQuery 의 slotIds 가 active 로 복원"
✅ "모달 저장 성공 시 mySchedule + availabilities invalidate"
✅ "모달 저장 시 409 응답이면 모달 닫고 alert"
```

### Step 5: commit + push + PR

```bash
git add -A
git commit -m "feat(me): InterviewScheduleCard + EditAvailabilityModal (PR-FE5)"
git push -u origin feat/interview-fe5-card
gh pr create ...
```

---

## 마무리

- [ ] **모든 PR 머지 후 전체 회귀**

```bash
cd /Users/ksy/Desktop/BASIC/Coding/Duing/frontend
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **수동 smoke 시나리오 (운영진 / 지원자 각 1회)**

운영진:
1. 새 모집 생성 (useInterview=true)
2. /interview 진입 → Step 1 form → config 활성화 + location 입력
3. Step 2 → 패턴 입력 → 미리보기 → 저장
4. (deadline 후) Step 3 → 자동 배정 실행 → 결과 확인
5. Step 4 → 슬롯별 그리드 + 수동 이동/취소

지원자:
1. 동일 모집 apply 진입 → Step 1 답변 → 다음 → Step 2 슬롯 선택 → 제출
2. /me/applications/[id] 카드 확인 → 가능시간 수정 모달 → 저장
3. 자동 배정 후 다시 진입 → 일정·장소 표시 확인

---

## 변경 이력

- 2026-06-08 — 최초 작성. Backend PR-IS (5 commit) + 6 PR-FE 분할로 면접 스케줄링 frontend 구현 계획 수립.
