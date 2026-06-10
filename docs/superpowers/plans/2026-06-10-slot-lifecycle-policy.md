# Slot Lifecycle Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec `docs/superpowers/specs/2026-06-10-slot-lifecycle-policy-design.md` 의 3-phase 슬롯 lifecycle 정책을 구현한다. 모집 시작일 기반의 단일 가드를 `availabilityDeadline` / `assignmentCompletedAt` 기반의 매트릭스 정책으로 전환.

**Architecture:** DB schema 변경 없음. `InterviewConfig` 에 도메인 메서드 추가 (`canCreateSlot` / `canModifySlot` / `canDeleteSlot` + `SlotMutableFields` enum). `LocalDateTime now` 와 `int availabilityCount` 를 인자로 받는 pure logic. `GeneralInterviewSlotService` 의 3 mutation 의 가드 교체. Frontend 는 응답 신규 필드 `slotLifecyclePhase` + 기존 `availabilityCount` 활용한 UI 매트릭스.

**Tech Stack:** Spring Boot 3.4 / Java 21 / JPA / QueryDSL / Flyway / RestAssured / TestContainers. Next.js 15 / React 19 / TypeScript 5 / TanStack Query 5 / Tailwind / MSW + Vitest.

**Scope:** 정책 매트릭스 + 도메인 메서드 + 가드 교체 + UI phase 표시. P1 (audit, rollback, 재자동배정) 은 Out of Scope.

**Branching:** 모든 PR 은 `develop` 분기 → `develop` PR. 1 task = 1 브랜치 = 1 PR.

---

## File Structure

### Backend (신규 생성 minimal, 기존 파일 확장)

- `backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java` — phase 메서드 + `SlotMutableFields` enum 추가
- `backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java` — 신규 4 예외
- `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java` — `countBySlotId...` 추가
- `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewSlotService.java` — 3 mutation 가드 교체
- `backend/src/main/java/com/duing/domain/interview/controller/dto/response/InterviewConfigResponse.java` — `slotLifecyclePhase` 필드 추가
- `backend/src/test/...` — 단위 + 통합 테스트

### Frontend (기존 파일 확장)

- `frontend/packages/api/src/generated/schema.d.ts` — OpenAPI regenerate
- `frontend/packages/types/src/interview.ts` — `InterviewSlotLifecyclePhase` 타입 추가
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewSlotSection.tsx` — phase 가드 교체
- `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/SlotPatternForm.tsx` — phase 1/2 별 활성/비활성
- `frontend/apps/web/components/interview/ManagementSlotCard.tsx` — `availabilityCount > 0` 배지 + 액션 활성 상태
- `frontend/apps/web/test/...` — RTL

---

## Task Sequencing

```
A (도메인 메서드) ──> D (서비스 가드)
B (예외)         ──┘
C (repo)         ──┘
                       └──> E (응답 확장) ──> F (FE foundation) ──> G (UI 매트릭스)
```

A/B/C 는 병렬 가능 (다른 파일). D 는 A/B/C 머지 후. E 는 D 후. F/G 는 E 후.

---

### Task A: `InterviewConfig` 에 phase 메서드 + `SlotMutableFields` enum

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/entity/InterviewConfig.java`
- Test: `backend/src/test/java/com/duing/domain/interview/entity/InterviewConfigSlotLifecycleTest.java`

- [ ] **Step 1: 실패하는 도메인 단위 테스트 작성**

매트릭스 케이스 (각 phase × availabilityCount 0/1+ 조합):

```java
class InterviewConfigSlotLifecycleTest {
    private static final LocalDateTime DEADLINE = LocalDateTime.of(2026, 6, 15, 18, 0);
    private static final LocalDateTime BEFORE = DEADLINE.minusHours(1);   // phase 1
    private static final LocalDateTime AFTER = DEADLINE.plusHours(1);     // phase 2

    @Test
    void canCreateSlot_phase1_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canCreateSlot(BEFORE)).isTrue();
    }

    @Test
    void canCreateSlot_phase2_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canCreateSlot(AFTER)).isTrue();
    }

    @Test
    void canCreateSlot_phase3_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        config.markAssignmentCompleted(AFTER);
        assertThat(config.canCreateSlot(AFTER)).isFalse();
    }

    @Test
    void canModifySlot_phase1_emptySlot_allowsTimeAndCapacity() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canModifySlot(0, BEFORE))
                .isEqualTo(InterviewConfig.SlotMutableFields.TIME_AND_CAPACITY);
    }

    @Test
    void canModifySlot_phase1_selectedSlot_capacityOnly() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canModifySlot(3, BEFORE))
                .isEqualTo(InterviewConfig.SlotMutableFields.CAPACITY_ONLY);
    }

    @Test
    void canModifySlot_phase2_selectedSlot_none() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canModifySlot(2, AFTER))
                .isEqualTo(InterviewConfig.SlotMutableFields.NONE);
    }

    @Test
    void canModifySlot_phase2_emptySlot_timeAndCapacity() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canModifySlot(0, AFTER))
                .isEqualTo(InterviewConfig.SlotMutableFields.TIME_AND_CAPACITY);
    }

    @Test
    void canModifySlot_phase3_none() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        config.markAssignmentCompleted(AFTER);
        assertThat(config.canModifySlot(0, AFTER))
                .isEqualTo(InterviewConfig.SlotMutableFields.NONE);
    }

    @Test
    void canDeleteSlot_phase1_emptySlot_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canDeleteSlot(0, BEFORE)).isTrue();
    }

    @Test
    void canDeleteSlot_phase2_selectedSlot_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        assertThat(config.canDeleteSlot(2, AFTER)).isFalse();
    }

    @Test
    void canDeleteSlot_phase3_anyCount_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(1L, DEADLINE);
        config.markAssignmentCompleted(AFTER);
        assertThat(config.canDeleteSlot(0, AFTER)).isFalse();
        assertThat(config.canDeleteSlot(3, AFTER)).isFalse();
    }
}
```

- [ ] **Step 2: 도메인 메서드 + enum 구현**

`InterviewConfig.java` 의 `markAssignmentCompleted` 메서드 아래에:

```java
public enum SlotMutableFields {
    NONE,
    CAPACITY_ONLY,
    TIME_AND_CAPACITY
}

public boolean canCreateSlot(LocalDateTime now) {
    return assignmentCompletedAt == null;
}

public SlotMutableFields canModifySlot(int availabilityCount, LocalDateTime now) {
    if (assignmentCompletedAt != null) return SlotMutableFields.NONE;
    boolean selected = availabilityCount > 0;
    if (now.isBefore(availabilityDeadline)) {
        return selected ? SlotMutableFields.CAPACITY_ONLY : SlotMutableFields.TIME_AND_CAPACITY;
    }
    return selected ? SlotMutableFields.NONE : SlotMutableFields.TIME_AND_CAPACITY;
}

public boolean canDeleteSlot(int availabilityCount, LocalDateTime now) {
    if (assignmentCompletedAt != null) return false;
    return availabilityCount == 0;
}
```

- [ ] **Step 3: 테스트 실행 + 통과 확인**

```bash
./gradlew :backend:test --tests "*InterviewConfigSlotLifecycleTest"
```

- [ ] **Step 4: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-a-domain-methods
git add -A && git commit -m "feat(interview): InterviewConfig 에 phase 메서드 + SlotMutableFields enum (Spec Slot Lifecycle Task A)"
git push -u origin feat/slot-lifecycle-a-domain-methods
gh pr create --base develop --title "feat(interview): InterviewConfig 에 phase 메서드 (Slot Lifecycle Task A)" --body "..."
```

자동 머지 금지.

---

### Task B: `InterviewException` 에 신규 4 예외 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/exception/InterviewException.java`

- [ ] **Step 1: 신규 4 예외 클래스 추가**

```java
public static class SlotCreationNotAllowedInCurrentPhase extends InterviewException {
    public SlotCreationNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "현재 단계에서는 슬롯을 추가할 수 없습니다. 자동배정이 이미 완료되었습니다.");
    }
}

public static class SlotModificationNotAllowedInCurrentPhase extends InterviewException {
    public SlotModificationNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "현재 단계에서는 이 슬롯을 수정할 수 없습니다.");
    }
}

public static class SlotDeletionNotAllowedInCurrentPhase extends InterviewException {
    public SlotDeletionNotAllowedInCurrentPhase() {
        super(HttpStatus.CONFLICT, "지원자가 선택한 슬롯이거나 자동배정이 완료되어 삭제할 수 없습니다.");
    }
}

public static class SlotTimeChangeForbiddenForSelectedSlot extends InterviewException {
    public SlotTimeChangeForbiddenForSelectedSlot() {
        super(HttpStatus.CONFLICT, "지원자가 선택한 슬롯의 시간은 변경할 수 없습니다. 정원만 변경할 수 있습니다.");
    }
}
```

기존 `InterviewException` 의 static class 추가 컨벤션 따름. 다른 InterviewException 의 message constant 패턴이 다르면 그것 따름 — 작업 전 파일 읽고 일관성 결정.

- [ ] **Step 2: 컴파일 통과 확인 + 단위 테스트가 필요하면 메시지 검증**

대부분의 InterviewException 은 단위 테스트가 없으므로 컴파일 통과만으로 충분. 메시지 사용처는 Task D 에서 통합 테스트로 검증.

- [ ] **Step 3: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-b-exceptions
git add -A && git commit -m "feat(interview): 슬롯 lifecycle 예외 4종 추가 (Spec Slot Lifecycle Task B)"
git push -u origin feat/slot-lifecycle-b-exceptions
gh pr create --base develop --title "feat(interview): 슬롯 lifecycle 예외 4종 (Task B)" --body "..."
```

---

### Task C: `InterviewAvailabilityRepository.countBySlotIdAndDeletedAtIsNull` 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/repository/InterviewAvailabilityRepository.java`
- Test: `backend/src/test/java/com/duing/domain/interview/repository/InterviewAvailabilityRepositoryTest.java`

- [ ] **Step 1: 실패 테스트 작성**

```java
@DataJpaTest
class InterviewAvailabilityRepositoryTest {

    @Autowired InterviewAvailabilityRepository repository;
    @Autowired EntityManager em;

    @Test
    void countBySlotId_returnsCountOfActiveAvailabilities() {
        InterviewAvailability a1 = InterviewAvailability.create(100L, 200L);
        InterviewAvailability a2 = InterviewAvailability.create(101L, 200L);
        InterviewAvailability a3 = InterviewAvailability.create(102L, 200L);
        em.persist(a1); em.persist(a2); em.persist(a3);
        em.flush();

        assertThat(repository.countBySlotIdAndDeletedAtIsNull(200L)).isEqualTo(3);
    }

    @Test
    void countBySlotId_excludesSoftDeleted() {
        InterviewAvailability a1 = InterviewAvailability.create(100L, 200L);
        InterviewAvailability a2 = InterviewAvailability.create(101L, 200L);
        em.persist(a1); em.persist(a2);
        em.flush();

        repository.delete(a1);  // @SQLDelete → deleted_at 세팅
        em.flush();

        assertThat(repository.countBySlotIdAndDeletedAtIsNull(200L)).isEqualTo(1);
    }

    @Test
    void countBySlotId_otherSlot_returnsZero() {
        InterviewAvailability a = InterviewAvailability.create(100L, 200L);
        em.persist(a); em.flush();

        assertThat(repository.countBySlotIdAndDeletedAtIsNull(999L)).isZero();
    }
}
```

기존 Repository test 의 컨벤션 (TestContainers vs DataJpaTest) 따름 — 작업 전 다른 InterviewAvailabilityRepositoryTest 가 있다면 그 패턴 일관성.

- [ ] **Step 2: Repository 메서드 추가**

```java
int countBySlotIdAndDeletedAtIsNull(Long slotId);
```

`@SQLRestriction` 이 derived 메서드에 자동 적용되므로 `countBySlotId(Long)` 도 동일 동작이지만, 명시 컨벤션 우선 (Task 1 교훈 — 기존 다른 repository 의 `AndDeletedAtIsNull` 사용 여부 확인 후 결정).

- [ ] **Step 3: 테스트 통과 확인**

```bash
./gradlew :backend:test --tests "InterviewAvailabilityRepositoryTest"
```

- [ ] **Step 4: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-c-availability-count-repo
git commit -m "feat(interview): InterviewAvailabilityRepository.countBySlotId 추가 (Slot Lifecycle Task C)"
git push && gh pr create ...
```

---

### Task D: `GeneralInterviewSlotService` 의 3 mutation 가드 교체

> Task A, B, C 머지 후 시작. Slot lifecycle 정책의 핵심.

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewSlotService.java`
- Test: `backend/src/test/java/com/duing/domain/interview/service/GeneralInterviewSlotServiceLifecycleTest.java` (신규)
- Test: `backend/src/test/java/com/duing/domain/interview/controller/ManagerInterviewSlotLifecycleTest.java` (신규)

- [ ] **Step 1: 단위 테스트 매트릭스 (Mockito)**

```java
class GeneralInterviewSlotServiceLifecycleTest {
    // setup: configRepository, slotRepository, availabilityRepository 모두 mock

    @Test
    void createBulk_phase3_throwsSlotCreationNotAllowed() {
        // given: config.assignmentCompletedAt != null
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(completedConfig));
        // when/then
        assertThatThrownBy(() -> service.createBulk(command))
                .isInstanceOf(InterviewException.SlotCreationNotAllowedInCurrentPhase.class);
        verifyNoInteractions(slotRepository);
    }

    @Test
    void createBulk_phase1_doesNotThrowRecruitmentAlreadyStarted_when_recruitmentStarted() {
        // given: recruitment.startDate < today (이전 정책에서 차단되던 케이스)
        //        config.availabilityDeadline > now (phase 1)
        //        config.assignmentCompletedAt == null
        // when: service.createBulk(command)
        // then: 정상 동작 — 새 정책에서 phase 1 은 startDate 와 무관
        service.createBulk(command);
        verify(slotRepository).saveAll(any());
    }

    @Test
    void updateSlot_phase2_selectedSlot_throwsModificationNotAllowed() {
        when(availabilityRepository.countBySlotIdAndDeletedAtIsNull(slotId)).thenReturn(2);
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(phase2Config));
        assertThatThrownBy(() -> service.updateSlot(command))
                .isInstanceOf(InterviewException.SlotModificationNotAllowedInCurrentPhase.class);
    }

    @Test
    void updateSlot_phase1_selectedSlot_timeChange_throwsTimeChangeForbidden() {
        // command 에 startTime != null
        when(availabilityRepository.countBySlotIdAndDeletedAtIsNull(slotId)).thenReturn(1);
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(phase1Config));
        assertThatThrownBy(() -> service.updateSlot(commandWithTimeChange))
                .isInstanceOf(InterviewException.SlotTimeChangeForbiddenForSelectedSlot.class);
    }

    @Test
    void updateSlot_phase1_selectedSlot_capacityOnly_succeeds() {
        // command 에 capacity 만, startTime/endTime null
        when(availabilityRepository.countBySlotIdAndDeletedAtIsNull(slotId)).thenReturn(3);
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(phase1Config));
        service.updateSlot(commandCapacityOnly);
        // verify slot.updateCapacity 호출 또는 동등 검증
    }

    @Test
    void deleteSlot_selectedSlot_throwsDeletionNotAllowed() {
        when(availabilityRepository.countBySlotIdAndDeletedAtIsNull(slotId)).thenReturn(1);
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(phase1Config));
        assertThatThrownBy(() -> service.deleteSlot(command))
                .isInstanceOf(InterviewException.SlotDeletionNotAllowedInCurrentPhase.class);
    }

    @Test
    void deleteSlot_emptySlot_phase2_succeeds() {
        when(availabilityRepository.countBySlotIdAndDeletedAtIsNull(slotId)).thenReturn(0);
        when(configRepository.findByRecruitmentId(...)).thenReturn(Optional.of(phase2Config));
        service.deleteSlot(command);
        verify(slotRepository).delete(any());
    }
}
```

- [ ] **Step 2: Service 메서드 가드 교체**

`createBulk` 의 `RecruitmentAlreadyStarted` 줄 제거 + 신규 가드:

```java
@Transactional
public List<Long> createBulk(CreateInterviewSlotsCommand command) {
    Recruitment recruitment = recruitmentRepository.findById(command.recruitmentId())
            .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
    clubAuthService.requireManager(command.actorUserId(), recruitment.getClub().getId());

    InterviewConfig config = configRepository.findByRecruitmentId(recruitment.getId())
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);

    LocalDateTime now = LocalDateTime.now();
    if (!config.canCreateSlot(now)) {
        throw new InterviewException.SlotCreationNotAllowedInCurrentPhase();
    }

    // 기존 RecruitmentAlreadyStarted 가드 제거
    // ...나머지 slot validation + 저장...
}
```

`updateSlot`:

```java
@Transactional
public void updateSlot(UpdateInterviewSlotCommand command) {
    InterviewSlot slot = slotRepository.findById(command.slotId())
            .orElseThrow(InterviewException.InterviewSlotNotFound::new);
    InterviewConfig config = configRepository.findByRecruitmentId(slot.getRecruitmentId())
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);

    int availabilityCount = availabilityRepository.countBySlotIdAndDeletedAtIsNull(slot.getId());
    LocalDateTime now = LocalDateTime.now();

    InterviewConfig.SlotMutableFields mutable = config.canModifySlot(availabilityCount, now);
    switch (mutable) {
        case NONE -> throw new InterviewException.SlotModificationNotAllowedInCurrentPhase();
        case CAPACITY_ONLY -> {
            if (command.startTime() != null || command.endTime() != null) {
                throw new InterviewException.SlotTimeChangeForbiddenForSelectedSlot();
            }
        }
        case TIME_AND_CAPACITY -> {
            // 시간/capacity 모두 허용
        }
    }

    // ...기존 update 로직...
}
```

`deleteSlot`:

```java
@Transactional
public void deleteSlot(DeleteInterviewSlotCommand command) {
    InterviewSlot slot = slotRepository.findById(command.slotId())
            .orElseThrow(InterviewException.InterviewSlotNotFound::new);
    InterviewConfig config = configRepository.findByRecruitmentId(slot.getRecruitmentId())
            .orElseThrow(InterviewException.InterviewConfigNotFound::new);

    int availabilityCount = availabilityRepository.countBySlotIdAndDeletedAtIsNull(slot.getId());
    LocalDateTime now = LocalDateTime.now();

    if (!config.canDeleteSlot(availabilityCount, now)) {
        throw new InterviewException.SlotDeletionNotAllowedInCurrentPhase();
    }

    // ...기존 delete 로직...
}
```

- [ ] **Step 3: 통합 테스트 (RestAssured)**

```java
@Test
void createSlot_phase2_succeedsAfterDeadline() {
    // 마감일이 지난 InterviewConfig + recruitment 셋업
    given().spec(authSpec(leaderToken))
        .body(...)
        .when().post("/api/v1/recruitments/{id}/interview-slots", recruitmentId)
        .then().statusCode(201);
}

@Test
void createSlot_phase3_returns409() {
    // assignmentCompletedAt != null 인 config 셋업
    given().spec(authSpec(leaderToken))
        .body(...)
        .when().post("/api/v1/recruitments/{id}/interview-slots", recruitmentId)
        .then().statusCode(409)
        .body("error.message", containsString("자동배정이 이미 완료"));
}

@Test
void deleteSlot_withAvailability_returns409() {
    // availability 가 있는 slot 셋업
    given().spec(authSpec(leaderToken))
        .when().delete("/api/v1/interview-slots/{slotId}", slotId)
        .then().statusCode(409)
        .body("error.message", containsString("지원자가 선택한 슬롯"));
}
```

매트릭스 12 케이스 모두 통합 테스트 — slot create / update / delete × phase 1/2/3 × availabilityCount 0/>0 (가능 조합만).

- [ ] **Step 4: 기존 `RecruitmentAlreadyStarted` 메시지에 의존하는 테스트가 있는지 검색 + 정정**

```bash
rg "RecruitmentAlreadyStarted|모집이 이미 시작" backend/src/test --type java
```

발견된 테스트는 새 정책에 맞게 갱신 — `SlotCreationNotAllowedInCurrentPhase` 대응으로 변경 또는 본 spec 의 새 흐름에 맞게 시나리오 재구성.

- [ ] **Step 5: 테스트 통과 확인**

```bash
./gradlew :backend:test --tests "GeneralInterviewSlotServiceLifecycleTest" --tests "ManagerInterviewSlotLifecycleTest"
```

회귀 확인:
```bash
./gradlew :backend:test --tests "*InterviewSlot*"
```

- [ ] **Step 6: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-d-service-guards
git commit -m "feat(interview): GeneralInterviewSlotService 3 mutation 가드 phase 기반으로 교체 (Slot Lifecycle Task D)"
git push && gh pr create ...
```

PR 본문에 매트릭스 12 케이스 + 기존 `RecruitmentAlreadyStarted` 호환성 정리 명시.

---

### Task E: `InterviewConfigResponse` 에 `slotLifecyclePhase` 필드 추가

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/interview/controller/dto/response/InterviewConfigResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/interview/service/dto/query/InterviewConfigQuery.java` (있다면)
- Modify: `backend/src/main/java/com/duing/domain/interview/service/GeneralInterviewConfigService.java`
- Test: 기존 `InterviewConfigControllerTest` 갱신

- [ ] **Step 1: Enum 정의 (응답용)**

```java
public enum SlotLifecyclePhase {
    BEFORE_DEADLINE,
    AFTER_DEADLINE_BEFORE_ASSIGNMENT,
    AFTER_ASSIGNMENT
}
```

위치: `backend/src/main/java/com/duing/domain/interview/entity/SlotLifecyclePhase.java` (도메인 enum 신규 파일) 또는 응답 DTO 안 nested enum — 기존 도메인의 enum 위치 컨벤션 따름.

- [ ] **Step 2: `InterviewConfig` 에 phase derived 메서드 추가**

```java
public SlotLifecyclePhase phase(LocalDateTime now) {
    if (assignmentCompletedAt != null) return SlotLifecyclePhase.AFTER_ASSIGNMENT;
    if (now.isBefore(availabilityDeadline)) return SlotLifecyclePhase.BEFORE_DEADLINE;
    return SlotLifecyclePhase.AFTER_DEADLINE_BEFORE_ASSIGNMENT;
}
```

Task A 의 단위 테스트에 매트릭스 3 케이스 추가:

```java
@Test
void phase_beforeDeadline_returnsBeforeDeadline() { ... }
@Test
void phase_afterDeadline_returnsAfterDeadlineBeforeAssignment() { ... }
@Test
void phase_afterAssignment_returnsAfterAssignment() { ... }
```

- [ ] **Step 3: Response DTO 갱신**

`InterviewConfigResponse` 에 필드 추가:
```java
public record InterviewConfigResponse(
    // ...existing,
    SlotLifecyclePhase slotLifecyclePhase
) { ... }
```

Service 에서 `config.phase(LocalDateTime.now())` 호출해서 채움.

- [ ] **Step 4: 통합 테스트**

```java
@Test
void getInterviewConfig_returnsCurrentPhase() {
    given().spec(authSpec(leaderToken))
        .when().get("/api/v1/recruitments/{id}/interview-config", recruitmentId)
        .then().statusCode(200)
        .body("data.slotLifecyclePhase", equalTo("BEFORE_DEADLINE"));
}
```

- [ ] **Step 5: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-e-config-phase-response
git commit -m "feat(interview): InterviewConfigResponse 에 slotLifecyclePhase 추가 (Slot Lifecycle Task E)"
git push && gh pr create ...
```

---

### Task F: Frontend foundation — OpenAPI regenerate + 도메인 타입

> Task A-E 모두 머지 후 시작.

**Files:**
- Modify: `frontend/packages/api/src/generated/schema.d.ts` (regenerate)
- Modify: `frontend/packages/types/src/interview.ts` — `InterviewSlotLifecyclePhase` 타입 + `InterviewConfig` 타입 갱신

- [ ] **Step 1: OpenAPI schema regenerate**

PR-FE3 패턴 — backend 띄우고:
```bash
cd backend && ./gradlew bootRun &
# Started DuingApplication 메시지 확인
cd frontend && pnpm gen:api
```

또는 backend 가 안 뜨면 수동 편집 — `InterviewConfigResponse` 컴포넌트에 `slotLifecyclePhase` 필드 추가 + 신규 `SlotLifecyclePhase` enum schema.

- [ ] **Step 2: 도메인 타입 별칭**

`packages/types/src/interview.ts`:
```ts
export type InterviewSlotLifecyclePhase =
  components['schemas']['InterviewConfigResponse']['slotLifecyclePhase'];

// 또는 명시적 narrow type:
export type InterviewSlotLifecyclePhase =
  | 'BEFORE_DEADLINE'
  | 'AFTER_DEADLINE_BEFORE_ASSIGNMENT'
  | 'AFTER_ASSIGNMENT';
```

`InterviewConfig` 도메인 타입에 필드가 자동 추가됨 (schema regenerate 시).

- [ ] **Step 3: typecheck + build**

```bash
pnpm --filter @duing/api typecheck
pnpm --filter @duing/types typecheck
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web build
```

- [ ] **Step 4: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-f-fe-foundation
git commit -m "feat(types): InterviewConfig 에 slotLifecyclePhase 타입 노출 (Slot Lifecycle Task F)"
git push && gh pr create ...
```

---

### Task G: Frontend — `InterviewSlotSection` + `ManagementSlotCard` phase UI 매트릭스

> Task F 머지 후 시작.

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewSlotSection.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/SlotPatternForm.tsx`
- Modify: `frontend/apps/web/components/interview/ManagementSlotCard.tsx`
- Test: 기존 RTL 갱신 + 신규 매트릭스 테스트

- [ ] **Step 1: 기존 `isRecruitmentStarted` 가드 제거 + phase 기반 분기**

`InterviewSlotSection.tsx`:
- props 에 `slotLifecyclePhase: InterviewSlotLifecyclePhase` 추가
- 기존 `recruitmentStarted` derive 제거 (해당 utility 함수도)
- phase 별 callout 분기:

```tsx
const phaseGuide = (() => {
  switch (slotLifecyclePhase) {
    case 'BEFORE_DEADLINE':
      return null;  // 기존 안내 유지
    case 'AFTER_DEADLINE_BEFORE_ASSIGNMENT':
      return (
        <div className="rounded-md border border-amber-200 bg-amber-50 ...">
          <p>면접 가능시간 제출이 마감되었습니다.</p>
          <p>추가 슬롯은 운영진 직권 배정 용도로 사용할 수 있습니다.</p>
          <p>지원자가 선택한 슬롯의 시간/정원은 더 이상 변경할 수 없습니다.</p>
        </div>
      );
    case 'AFTER_ASSIGNMENT':
      return (
        <div className="rounded-md border border-slate-300 bg-slate-50 ...">
          <p>자동배정이 완료되었습니다.</p>
          <p>슬롯 추가·수정·삭제가 잠금되었습니다.</p>
          <p>면접 일정 변경은 운영진 수동 배정(개별 지원자 상세 페이지) 으로만 가능합니다.</p>
        </div>
      );
    default:
      const _exhaustive: never = slotLifecyclePhase;
      return null;
  }
})();

const canCreateSlots = slotLifecyclePhase !== 'AFTER_ASSIGNMENT';
```

`<SlotPatternForm disabled={!canCreateSlots} />`.

- [ ] **Step 2: `ManagementSlotCard` 에 phase + availabilityCount 매트릭스**

```tsx
type Props = {
  slot: ManagementSlotView;
  slotLifecyclePhase: InterviewSlotLifecyclePhase;
  onDeleteSlot: (slotId: number) => void;
  onUpdateSlot?: (slotId: number, fields: SlotUpdateFields) => void;
};

const availabilityCount = slot.availabilityCount ?? 0;
const isSelected = availabilityCount > 0;

const canDelete = (() => {
  if (slotLifecyclePhase === 'AFTER_ASSIGNMENT') return false;
  return availabilityCount === 0;
})();

const canEditTime = (() => {
  if (slotLifecyclePhase === 'AFTER_ASSIGNMENT') return false;
  if (isSelected) return false;
  return true;
})();

const canEditCapacity = (() => {
  if (slotLifecyclePhase === 'AFTER_ASSIGNMENT') return false;
  if (slotLifecyclePhase === 'AFTER_DEADLINE_BEFORE_ASSIGNMENT' && isSelected) return false;
  return true;
})();
```

UI:
- `isSelected` 면 "지원자 {N}명 선택" 배지
- canDelete=false 시 삭제 버튼 disabled + tooltip "지원자가 선택한 슬롯이거나 자동배정 완료 — 삭제 불가"
- canEditTime / canEditCapacity 가 false 면 해당 필드 disabled + 안내

기존 `handleDeleteSlot` 의 `window.confirm` 도 `isSelected` 일 때 분기 — confirm 자체를 안 띄우고 disabled.

- [ ] **Step 3: 실패 RTL 테스트 매트릭스**

```tsx
describe('ManagementSlotCard', () => {
  it('phase 1 + emptySlot: 시간 + 정원 수정 + 삭제 모두 활성', () => {
    render(<ManagementSlotCard slot={{...emptySlot}} slotLifecyclePhase="BEFORE_DEADLINE" ... />);
    expect(screen.getByRole('button', { name: /삭제/ })).toBeEnabled();
  });

  it('phase 1 + selectedSlot: 시간 비활성, 정원 활성, 삭제 비활성', () => {
    render(<ManagementSlotCard slot={{...selectedSlot, availabilityCount: 3}} slotLifecyclePhase="BEFORE_DEADLINE" ... />);
    expect(screen.getByText(/지원자 3명 선택/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /삭제/ })).toBeDisabled();
  });

  it('phase 2 + selectedSlot: 모든 수정/삭제 비활성', () => { ... });
  it('phase 2 + emptySlot: 자유롭게 수정/삭제 가능', () => { ... });
  it('phase 3 + any: 모든 액션 비활성', () => { ... });
});
```

- [ ] **Step 4: `InterviewSlotSection` 테스트 갱신**

기존 `recruitmentStarted` 케이스 테스트를 phase 매트릭스로 재구성. 3 phase × 2 신규 슬롯 추가 가능 여부 = 3 케이스 (phase 1/2 가능, phase 3 불가).

- [ ] **Step 5: 운영진 페이지 헤더 phase 표시**

`InterviewManagementPage.tsx` (또는 슬롯 관리 페이지) 헤더에:
```tsx
const phaseLabel = {
  BEFORE_DEADLINE: '면접 가능시간 제출 단계',
  AFTER_DEADLINE_BEFORE_ASSIGNMENT: '운영진 배정 준비 단계',
  AFTER_ASSIGNMENT: '자동배정 완료 — 슬롯 잠금',
}[slotLifecyclePhase];

<span className="text-xs text-slate-500">현재: {phaseLabel}</span>
```

- [ ] **Step 6: typecheck + build + test**

```bash
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web build
pnpm --filter @duing/web test
```

- [ ] **Step 7: 수동 smoke (가능하면)**

```bash
pnpm --filter @duing/web dev
# 운영진 로그인 → 슬롯 관리 페이지 진입 → 각 phase 별 UI 확인
```

- [ ] **Step 8: 커밋 + PR**

```bash
git checkout -b feat/slot-lifecycle-g-fe-phase-ui
git commit -m "feat(manage): 슬롯 관리 페이지 phase 매트릭스 UI (Slot Lifecycle Task G)"
git push && gh pr create ...
```

PR 본문에 phase 별 UI 변경 + 매트릭스 명시.

---

## Post-Implementation

Task A-G 모두 머지 후 end-to-end 수동 smoke:
- 새 모집 생성 → InterviewConfig 셋업 → phase 1 진입 확인
- 슬롯 생성/수정/삭제 — phase 1 매트릭스
- `availabilityDeadline` 시점 지남 (시간 조정 또는 admin 도구로) → phase 2 진입 → UI 갱신 + 매트릭스 확인
- 자동배정 실행 → phase 3 → 슬롯 액션 잠금 확인
- Phase 3 에서도 M9 수동 배정 + M10 취소 작동 확인 (Override Mode 포함)

후속 PR 백로그:
- `RecruitmentAlreadyStarted` 예외 클래스 자체 제거 (cleanup PR)
- `Clock` 추상화 도입 (테스트 결정성 강화)
- Audit (Override + slot 변경 이력)
- `assignmentCompletedAt` rollback 액션

---

## Self-Review Checklist (작성자 self-check)

- [ ] spec Out of Scope 항목과 충돌하지 않는가
- [ ] 모든 PR 본문에 spec 링크 포함되어 있는가
- [ ] Backend 응답 변경이 기존 클라이언트에 breaking 인지 (필드 추가만 → 비파괴)
- [ ] Frontend 컴포넌트 prop 이 spec 의 정책 매트릭스를 정확히 반영
- [ ] `LocalDateTime.now()` 호출이 service 레이어에만 있고 도메인은 인자 주입
- [ ] 자동 머지 시도 금지 — 사용자 지시 후에만 머지
- [ ] 워크플로 메모리 따라 duing-code-reviewer + codex:review 매 PR 마다 dispatch
- [ ] **데이터 무결성** trigger (Task D 의 slot CRUD 가드 변경) → adversarial review 추가 검토
