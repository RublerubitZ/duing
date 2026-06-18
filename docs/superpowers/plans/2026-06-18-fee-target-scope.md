# 회비 청구 대상(Target Scope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회비 정책에 청구 대상(`targetType`: ALL_MEMBERS / SELECTED_MEMBERS)을 추가해, 운영진이 전체 회원 회비와 특정 회원 참가비를 같은 회비 시스템에서 구분 발행할 수 있게 한다.

**Architecture:** Stateless — 선택 회원 명단은 정책에 영속화하지 않고 발행 요청마다 `memberIds`로 전달한다. 정책의 `targetType`은 발행 시 memberIds 필수/금지를 가르는 검증 게이트 + 표시용 메타다. 발행 단건(Bill) 하류(영수증·납부·장부·연체)는 무수정. 자동발행은 ALL_MEMBERS만 허용.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / JPA(native query) / RestAssured+TestContainers (BE), Next.js 15 / React 19 / Zod / RHF / TanStack Query (FE).

**설계서:** `docs/superpowers/specs/2026-06-18-fee-target-scope-design.md`

**핵심 규칙 요약**
- `targetType`은 생성 시 고정(수정 불가, billingType 잠금과 동일).
- `autoIssue=true` ⟹ `targetType=ALL_MEMBERS` (서비스 검증 + DB CHECK).
- 발행 검증: ALL+memberIds → 400 / SELECTED+빈 memberIds → 400 / `@Size(max=500)` / 타동아리·미존재 → 400 / 탈퇴자 → skip(skippedUserIds).
- 응답 `{created, skipped, skippedUserIds}`.
- created=0 → 409는 **SELECTED 수동 발행만**. ALL 멱등(created=0/201)·동시성 계약·크론은 불변.

---

## 작업 순서 & 파일맵

| Task | 영역 | 핵심 산출물 |
|------|------|-------------|
| 1 | BE 데이터 모델 | `FeeTargetType` enum, `FeePolicy.targetType`, V68 마이그레이션, `FeePolicyFixture` |
| 2 | BE 정책 생성/응답 | 정책 DTO 4종 + `create` 검증(autoIssue⟹ALL) + 신규 예외 + 정책 컨트롤러 테스트 |
| 3 | BE 청구 발행 | 발행 DTO·repo 쿼리·예외·`generate` 분기·created=0 가드 + 발행 컨트롤러 테스트 |
| 4 | FE 정책 측 | `@duing/types`·`@duing/schemas` + `CreatePolicyDialog`(라디오·잠금) + `PolicyList`(배지) + 픽스처 |
| 5 | FE 발행 측 | `GenerateBillsDialog` 회원 멀티셀렉트 + skipped 안내 |

> FE 타입(필수 필드 `FeePolicy.targetType`, `CreateFeePolicyPayload.targetType`, `GenerateBillsResult.skippedUserIds`) 변경은 소비처(폼·테스트 픽스처)를 함께 고쳐야 `apps/web` 타입체크가 통과한다. 그래서 타입·스키마·정책 폼·목록·픽스처를 **Task 4 한 번에** 묶어 각 task 종료 시 빌드가 green 이도록 한다.

---

## Task 1: BE 데이터 모델 — FeeTargetType · FeePolicy · V68

**Files:**
- Create: `backend/src/main/java/com/duing/domain/fee/entity/FeeTargetType.java`
- Create: `backend/src/main/resources/db/migration/V68__fee_policy_target_type.sql`
- Modify: `backend/src/main/java/com/duing/domain/fee/entity/FeePolicy.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeePolicyService.java` (create() 호출부 임시 보정)
- Modify: `backend/src/test/java/com/duing/common/fixture/FeePolicyFixture.java`

- [ ] **Step 1: enum 생성**

`FeeTargetType.java`:

```java
package com.duing.domain.fee.entity;

public enum FeeTargetType {
    ALL_MEMBERS,
    SELECTED_MEMBERS
}
```

- [ ] **Step 2: V68 마이그레이션 작성**

`V68__fee_policy_target_type.sql`:

```sql
-- 회비 정책에 청구 대상(target_type) 추가: ALL_MEMBERS(전체 활성 회원, 현행) / SELECTED_MEMBERS(지정 회원만).
-- 기존 정책은 ALL_MEMBERS 로 백필해 현행 동작을 보존한다.
-- 자동발행(auto_issue)은 ALL_MEMBERS 정책만 허용한다 — 선택 회원 명단을 정책에 저장하지 않으므로
-- 크론이 발행 대상을 알 수 없기 때문이다. (기존 chk_fee_policy_auto_issue 는 수정하지 않고 CHECK 를 추가한다.)
-- length=30 은 report.target_type 선례와 동일. 엔티티 @Column(length=30, nullable=false) 와 정합(ddl-auto=validate).
ALTER TABLE fee_policy ADD COLUMN target_type VARCHAR(30) NOT NULL DEFAULT 'ALL_MEMBERS';

ALTER TABLE fee_policy ADD CONSTRAINT chk_fee_policy_target_type
    CHECK (target_type IN ('ALL_MEMBERS', 'SELECTED_MEMBERS'));

ALTER TABLE fee_policy ADD CONSTRAINT chk_fee_policy_auto_issue_all_members
    CHECK (auto_issue = FALSE OR target_type = 'ALL_MEMBERS');
```

- [ ] **Step 3: FeePolicy 엔티티에 targetType 추가**

`FeePolicy.java` — `billingType` 필드 다음(active 위)에 필드 추가(`FeeTargetType`는 같은 패키지라 import 불필요):

```java
    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 30)
    private FeeTargetType targetType;
```

private 생성자와 정적팩토리 `create`를 targetType을 받도록 교체:

```java
    @Builder(access = AccessLevel.PRIVATE)
    private FeePolicy(Long clubId, String name, Long amount, BillingType billingType,
                      FeeTargetType targetType, boolean active) {
        this.clubId = clubId;
        this.name = name;
        this.amount = amount;
        this.billingType = billingType;
        this.targetType = targetType;
        this.active = active;
    }

    public static FeePolicy create(Long clubId, String name, Long amount, BillingType billingType,
                                   FeeTargetType targetType) {
        return FeePolicy.builder()
                .clubId(clubId).name(name).amount(amount).billingType(billingType)
                .targetType(targetType).active(true)
                .build();
    }
```

`update(...)`와 `applyAutoIssue(...)`는 변경하지 않는다(targetType 불변).

- [ ] **Step 4: create() 호출부 컴파일 보정 (임시)**

`GeneralFeePolicyService.create`의 `FeePolicy.create(...)` 호출을 ALL_MEMBERS 리터럴로 보정(Task 2에서 command.targetType()으로 교체). import에 `com.duing.domain.fee.entity.FeeTargetType` 추가:

```java
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(),
                command.billingType(), FeeTargetType.ALL_MEMBERS);
```

- [ ] **Step 5: FeePolicyFixture 갱신 + SELECTED 헬퍼 추가**

`FeePolicyFixture.java` 전체를 교체:

```java
package com.duing.common.fixture;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;

public final class FeePolicyFixture {

    private FeePolicyFixture() {
    }

    public static FeePolicy monthly(Long clubId) {
        return FeePolicy.create(clubId, "월 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
    }

    public static FeePolicy of(Long clubId, BillingType billingType, long amount) {
        return FeePolicy.create(clubId, "회비", amount, billingType, FeeTargetType.ALL_MEMBERS);
    }

    /** active=false 로 비활성화된 회비 정책(발행 시 409 검증용). */
    public static FeePolicy inactive(Long clubId) {
        FeePolicy policy = FeePolicy.create(clubId, "비활성 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
        policy.update(null, null, null, false);
        return policy;
    }

    /** 자동 월발행이 켜진 MONTHLY 정책(issueDay/dueDay 지정). */
    public static FeePolicy autoIssue(Long clubId, int issueDay, int dueDay) {
        FeePolicy policy = FeePolicy.create(clubId, "자동 월 회비", 10000L, BillingType.MONTHLY, FeeTargetType.ALL_MEMBERS);
        policy.applyAutoIssue(true, issueDay, dueDay);
        return policy;
    }

    /** 특정 회원 대상(SELECTED_MEMBERS) 정책 — 발행 시 memberIds 필수. */
    public static FeePolicy selected(Long clubId, BillingType billingType, long amount) {
        return FeePolicy.create(clubId, "참가비", amount, billingType, FeeTargetType.SELECTED_MEMBERS);
    }
}
```

- [ ] **Step 6: 다른 `FeePolicy.create` 호출부 확인**

Run: `grep -rn "FeePolicy.create(" backend/src`
Expected: `GeneralFeePolicyService.java`와 `FeePolicyFixture.java`만 매칭(둘 다 5-arg로 갱신됨). 그 외 매칭이 있으면 동일하게 `FeeTargetType.ALL_MEMBERS`를 추가한다.

- [ ] **Step 7: 컴파일 + ddl-validate + 기존 회귀 검증**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeePolicyControllerTest" --tests "com.duing.domain.fee.LeaderFeeBillControllerTest" --tests "com.duing.domain.fee.LeaderFeePolicyAutoIssueControllerTest"`
Expected: BUILD SUCCESSFUL. (정책/발행 테스트가 부팅되며 `ddl-auto=validate`가 V68 컬럼-엔티티 정합을 검증하고, 기존 정책이 ALL_MEMBERS 기본값으로 동작 보존됨을 확인.)

- [ ] **Step 8: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/entity/FeeTargetType.java \
        backend/src/main/resources/db/migration/V68__fee_policy_target_type.sql \
        backend/src/main/java/com/duing/domain/fee/entity/FeePolicy.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralFeePolicyService.java \
        backend/src/test/java/com/duing/common/fixture/FeePolicyFixture.java
git commit -m "feat(backend): 회비 정책에 청구 대상(targetType) 컬럼·enum·V68 마이그레이션 추가"
```

---

## Task 2: BE 정책 생성/응답 — targetType 배선 + autoIssue⟹ALL 검증

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/request/CreateFeePolicyRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/command/CreateFeePolicyCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/query/FeePolicyQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/FeePolicyResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/exception/FeePolicyException.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeePolicyService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/LeaderFeePolicyControllerTest.java`

- [ ] **Step 1: 실패 테스트 작성 (정책 생성/응답/검증)**

`LeaderFeePolicyControllerTest.java`에 케이스 추가. 엔드포인트는 `POST /api/v1/leader/clubs/{clubId}/fee-policies`, 조회는 `GET .../fee-policies`(응답 `data[].targetType`). 기존 파일의 setUp(`leaderToken`/`clubId`)·생성 테스트 RestAssured 패턴을 그대로 따른다.

```java
    @Test
    @DisplayName("청구 대상을 SELECTED_MEMBERS 로 지정해 정책을 생성하면 응답에 targetType 이 담긴다")
    void createSelectedMembersPolicy() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "MT 참가비");
        body.put("amount", 50000);
        body.put("billingType", "ONE_TIME");
        body.put("targetType", "SELECTED_MEMBERS");

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.CREATED.value());

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.find { it.name == 'MT 참가비' }.targetType", equalTo("SELECTED_MEMBERS"));
    }

    @Test
    @DisplayName("targetType 을 생략하면 400 을 반환한다")
    void targetTypeRequired() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "회비");
        body.put("amount", 10000);
        body.put("billingType", "MONTHLY");
        // targetType 누락

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("SELECTED_MEMBERS 정책에 자동발행을 켜면 400 을 반환한다")
    void autoIssueRequiresAllMembers() {
        Map<String, Object> body = new HashMap<>();
        body.put("name", "자동 참가비");
        body.put("amount", 10000);
        body.put("billingType", "MONTHLY");
        body.put("targetType", "SELECTED_MEMBERS");
        body.put("autoIssue", true);
        body.put("issueDay", 5);
        body.put("dueDay", 20);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON).body(body)
                .when().post("/api/v1/leader/clubs/" + clubId + "/fee-policies")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
```

기존 import에 `java.util.HashMap`, `java.util.Map`, `org.hamcrest.Matchers.equalTo`(static), `io.restassured.http.ContentType`가 없으면 추가한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeePolicyControllerTest"`
Expected: FAIL — `createSelectedMembersPolicy`·`autoIssueRequiresAllMembers`(현재 미차단). `targetTypeRequired`도 현재 targetType 필드가 없어 실패 가능.

- [ ] **Step 3: 정책 DTO 4종에 targetType 추가**

`CreateFeePolicyRequest.java` — `billingType` 다음에 `targetType` 추가, import에 `com.duing.domain.fee.entity.FeeTargetType` 추가:

```java
public record CreateFeePolicyRequest(
        @NotBlank(message = "정책 이름은 필수입니다.") @Size(max = 100, message = "정책 이름은 100자 이하여야 합니다.") String name,
        @NotNull(message = "금액은 필수입니다.") @PositiveOrZero(message = "금액은 0 이상이어야 합니다.") Long amount,
        @NotNull(message = "회비 유형은 필수입니다.") BillingType billingType,
        @NotNull(message = "청구 대상은 필수입니다.") FeeTargetType targetType,
        Boolean autoIssue,
        @Min(value = 1, message = "발행일은 1~28 사이여야 합니다.") @Max(value = 28, message = "발행일은 1~28 사이여야 합니다.") Integer issueDay,
        @Min(value = 1, message = "마감일은 1~28 사이여야 합니다.") @Max(value = 28, message = "마감일은 1~28 사이여야 합니다.") Integer dueDay) {

    public CreateFeePolicyCommand toCommand(Long clubId, Long actorId) {
        return new CreateFeePolicyCommand(clubId, actorId, name, amount, billingType, targetType,
                autoIssue, issueDay, dueDay);
    }
}
```

`CreateFeePolicyCommand.java`:

```java
package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeTargetType;

public record CreateFeePolicyCommand(Long clubId, Long actorId, String name, Long amount, BillingType billingType,
                                     FeeTargetType targetType, Boolean autoIssue, Integer issueDay, Integer dueDay) {
}
```

`FeePolicyQuery.java`:

```java
package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;

public record FeePolicyQuery(Long id, String name, Long amount, BillingType billingType, FeeTargetType targetType,
                             boolean active, boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyQuery from(FeePolicy policy) {
        return new FeePolicyQuery(policy.getId(), policy.getName(), policy.getAmount(),
                policy.getBillingType(), policy.getTargetType(), policy.isActive(),
                policy.isAutoIssue(), policy.getIssueDay(), policy.getDueDay());
    }
}
```

`FeePolicyResponse.java`:

```java
package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.service.dto.query.FeePolicyQuery;

public record FeePolicyResponse(Long id, String name, Long amount, BillingType billingType, FeeTargetType targetType,
                                boolean active, boolean autoIssue, Integer issueDay, Integer dueDay) {

    public static FeePolicyResponse from(FeePolicyQuery query) {
        return new FeePolicyResponse(query.id(), query.name(), query.amount(), query.billingType(),
                query.targetType(), query.active(), query.autoIssue(), query.issueDay(), query.dueDay());
    }
}
```

- [ ] **Step 4: 신규 예외 추가**

`FeePolicyException.java`에 inner class 추가(`InvalidIssueScheduleException` 다음):

```java
    public static class AutoIssueRequiresAllMembersException extends FeePolicyException {
        private static final String MESSAGE = "자동 발행은 전체 회원(ALL_MEMBERS) 정책에서만 설정할 수 있습니다.";

        public AutoIssueRequiresAllMembersException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
```

- [ ] **Step 5: 서비스 create/update 검증 배선**

`GeneralFeePolicyService.java` — Task 1에서 ALL_MEMBERS 리터럴로 보정했던 create를 command.targetType()으로 교체하고, `validateAutoIssue`에 targetType 검증을 추가한다.

create():

```java
    @Override
    @Transactional
    public Long create(CreateFeePolicyCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        FeePolicy policy = FeePolicy.create(command.clubId(), command.name(), command.amount(),
                command.billingType(), command.targetType());
        if (Boolean.TRUE.equals(command.autoIssue())) {
            validateAutoIssue(command.billingType(), command.targetType(), command.issueDay(), command.dueDay());
            policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
        }
        return feePolicyRepository.save(policy).getId();
    }
```

update()의 autoIssue=true 분기에서 `validateAutoIssue` 호출에 `policy.getTargetType()`을 넘긴다(targetType은 불변이므로 정책의 현재 값):

```java
            if (command.autoIssue()) {
                // billingType 미전송 시 기존 타입 유지되므로 policy 의 최신 타입으로 검증한다. targetType 은 불변.
                validateAutoIssue(policy.getBillingType(), policy.getTargetType(), command.issueDay(), command.dueDay());
                policy.applyAutoIssue(true, command.issueDay(), command.dueDay());
            } else {
```

`validateAutoIssue` 시그니처에 targetType 추가 + 맨 앞에 ALL_MEMBERS 검증:

```java
    // 생성·수정 공유 검증: 자동발행은 ALL_MEMBERS + MONTHLY 한정, 발행일·마감일 1~28, 마감일 >= 발행일.
    private void validateAutoIssue(BillingType billingType, FeeTargetType targetType, Integer issueDay, Integer dueDay) {
        if (targetType != FeeTargetType.ALL_MEMBERS) {
            throw new FeePolicyException.AutoIssueRequiresAllMembersException();
        }
        if (billingType != BillingType.MONTHLY) {
            throw new FeePolicyException.AutoIssueNotMonthlyException();
        }
        if (issueDay == null || dueDay == null
                || issueDay < 1 || issueDay > 28 || dueDay < 1 || dueDay > 28
                || dueDay < issueDay) {
            throw new FeePolicyException.InvalidIssueScheduleException();
        }
    }
```

`FeeTargetType` import는 Task 1에서 추가됨(없으면 추가).

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeePolicyControllerTest"`
Expected: PASS (신규 3케이스 + 기존 케이스 전부).

- [ ] **Step 7: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/controller/dto/request/CreateFeePolicyRequest.java \
        backend/src/main/java/com/duing/domain/fee/service/dto/command/CreateFeePolicyCommand.java \
        backend/src/main/java/com/duing/domain/fee/service/dto/query/FeePolicyQuery.java \
        backend/src/main/java/com/duing/domain/fee/controller/dto/response/FeePolicyResponse.java \
        backend/src/main/java/com/duing/domain/fee/exception/FeePolicyException.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralFeePolicyService.java \
        backend/src/test/java/com/duing/domain/fee/LeaderFeePolicyControllerTest.java
git commit -m "feat(backend): 회비 정책 생성에 청구 대상 배선 및 자동발행 전체회원 제약 추가"
```

---

## Task 3: BE 청구 발행 — memberIds 발행·검증·skippedUserIds·created=0 가드

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/request/GenerateBillsRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/command/GenerateBillsCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/dto/query/GenerateBillsResult.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/controller/dto/response/GenerateBillsResponse.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/exception/FeeBillException.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/repository/FeeBillRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/service/GeneralFeeBillService.java`
- Test: `backend/src/test/java/com/duing/domain/fee/LeaderFeeBillControllerTest.java`

- [ ] **Step 1: 실패 테스트 작성 (SELECTED 발행 시나리오)**

`LeaderFeeBillControllerTest.java`에 헬퍼와 케이스 추가. 기존 헬퍼(`addActiveMembers`, `generateAs`, `countBills`, `savePolicy`, `monthlyBody`)와 새 픽스처 `FeePolicyFixture.selected`를 사용한다. import에 `com.duing.common.fixture.ClubFixture`가 있는지 확인(없으면 추가). `Club`·`User`·`ClubMember`·`List`·`HashMap`·`Map`은 기존 import에 존재.

```java
    private FeePolicy saveSelectedPolicy(BillingType billingType, long amount) {
        return feePolicyRepository.save(FeePolicyFixture.selected(clubId, billingType, amount));
    }

    private Map<String, Object> selectedBody(String billingPeriod, List<Long> memberIds) {
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", billingPeriod);
        body.put("billingStartDate", "2026-09-01");
        body.put("billingEndDate", "2026-09-01");
        body.put("dueDate", "2026-09-30");
        body.put("memberIds", memberIds);
        return body;
    }

    @Test
    @DisplayName("SELECTED 정책은 지정한 회원에게만 청구가 생성된다")
    void selectedMembersOnly() {
        List<Long> added = addActiveMembers(3); // setUp 2명 + 3명 = 활성 5명
        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);

        List<Long> targets = List.of(added.get(0), added.get(1));
        generateAs(leaderToken, policy.getId(), selectedBody("MT 참가비", targets))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(2))
                .body("data.skipped", equalTo(0))
                .body("data.skippedUserIds.size()", equalTo(0));

        assertThat(countBills(policy.getId())).isEqualTo(2L);
    }

    @Test
    @DisplayName("SELECTED 발행에서 이미 발행된 회원은 skippedUserIds 로 보고된다")
    void selectedAlreadyIssuedSkipped() {
        List<Long> added = addActiveMembers(2);
        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);
        Long first = added.get(0);
        Long second = added.get(1);

        generateAs(leaderToken, policy.getId(), selectedBody("MT", List.of(first)))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(1));

        // first 는 이미 발행됨 → second 만 created, first 는 skippedUserIds
        generateAs(leaderToken, policy.getId(), selectedBody("MT", List.of(first, second)))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(1))
                .body("data.skipped", equalTo(1))
                .body("data.skippedUserIds", org.hamcrest.Matchers.contains(first.intValue()));
    }

    @Test
    @DisplayName("SELECTED 발행에서 선택 회원이 전원 이미 발행됐으면 409 를 반환한다")
    void selectedAllAlreadyIssuedConflict() {
        List<Long> added = addActiveMembers(1);
        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);
        List<Long> targets = List.of(added.get(0));

        generateAs(leaderToken, policy.getId(), selectedBody("MT", targets))
                .then().statusCode(HttpStatus.CREATED.value()).body("data.created", equalTo(1));

        generateAs(leaderToken, policy.getId(), selectedBody("MT", targets))
                .then().statusCode(HttpStatus.CONFLICT.value());
    }

    @Test
    @DisplayName("SELECTED 발행에서 탈퇴한 회원은 거부 없이 제외되어 skippedUserIds 로 보고된다")
    void selectedExcludesDeletedMember() {
        List<Long> added = addActiveMembers(2);
        Long activeUser = added.get(0);
        Long leftUser = added.get(1);
        // leftUser 를 탈퇴(soft delete)
        ClubMember target = clubMemberRepository.findByClubIdAndUserId(clubId, leftUser).orElseThrow();
        clubMemberRepository.delete(target);

        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);

        generateAs(leaderToken, policy.getId(), selectedBody("MT", List.of(activeUser, leftUser)))
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data.created", equalTo(1))
                .body("data.skippedUserIds", org.hamcrest.Matchers.contains(leftUser.intValue()));
    }

    @Test
    @DisplayName("SELECTED 발행에 타 동아리 회원 id 가 섞이면 400 을 반환한다")
    void selectedRejectsForeignMember() {
        List<Long> added = addActiveMembers(1);
        // 다른 동아리의 회원
        Club otherClub = clubRepository.save(ClubFixture.academic("동아리B"));
        User otherUser = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asMember(otherClub, otherUser));

        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);

        generateAs(leaderToken, policy.getId(), selectedBody("MT", List.of(added.get(0), otherUser.getId())))
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("SELECTED 정책에 memberIds 없이 발행하면 400 을 반환한다")
    void selectedRequiresMemberIds() {
        FeePolicy policy = saveSelectedPolicy(BillingType.ONE_TIME, 50000L);
        Map<String, Object> body = new HashMap<>();
        body.put("billingPeriod", "MT");
        body.put("billingStartDate", "2026-09-01");
        body.put("billingEndDate", "2026-09-01");
        body.put("dueDate", "2026-09-30");
        // memberIds 누락

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("ALL_MEMBERS 정책에 memberIds 를 보내면 400 을 반환한다")
    void allMembersRejectsMemberIds() {
        List<Long> added = addActiveMembers(1);
        FeePolicy policy = savePolicy(BillingType.MONTHLY, 10000L); // ALL_MEMBERS
        Map<String, Object> body = monthlyBody("2026-07");
        body.put("memberIds", List.of(added.get(0)));

        generateAs(leaderToken, policy.getId(), body)
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeeBillControllerTest"`
Expected: FAIL (memberIds 미지원 — SELECTED 케이스 실패, 기존 ALL 케이스는 통과).

- [ ] **Step 3: 발행 요청/커맨드에 memberIds 추가**

`GenerateBillsRequest.java` — import에 `jakarta.validation.constraints.Size`, `java.util.List` 추가:

```java
public record GenerateBillsRequest(
        @NotBlank(message = "회차 라벨은 필수입니다.") String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        @Size(max = 500, message = "청구 대상은 최대 500명까지 지정할 수 있습니다.") List<Long> memberIds
) {
    public GenerateBillsCommand toCommand(Long clubId, Long actorId, Long policyId) {
        return new GenerateBillsCommand(clubId, actorId, policyId,
                billingPeriod, billingStartDate, billingEndDate, dueDate, memberIds);
    }
}
```

`GenerateBillsCommand.java` — `java.util.List` 추가:

```java
public record GenerateBillsCommand(
        Long clubId,
        Long actorId,
        Long policyId,
        String billingPeriod,
        LocalDate billingStartDate,
        LocalDate billingEndDate,
        LocalDate dueDate,
        List<Long> memberIds          // SELECTED_MEMBERS 정책일 때만 사용(ALL 은 null/빈 배열)
) {
}
```

- [ ] **Step 4: 발행 결과/응답에 skippedUserIds 추가**

`GenerateBillsResult.java`:

```java
package com.duing.domain.fee.service.dto.query;

import java.util.List;

public record GenerateBillsResult(int created, int skipped, List<Long> skippedUserIds) {
}
```

`GenerateBillsResponse.java`:

```java
package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import java.util.List;

public record GenerateBillsResponse(int created, int skipped, List<Long> skippedUserIds) {
    public static GenerateBillsResponse from(GenerateBillsResult result) {
        return new GenerateBillsResponse(result.created(), result.skipped(), result.skippedUserIds());
    }
}
```

- [ ] **Step 5: 발행 예외 추가**

`FeeBillException.java`에 inner class 2개 추가(`ReceiptUnavailableException` 다음):

```java
    // 청구 대상(memberIds) 입력 검증 — 전부 400. code 로 사유 구분.
    public static class InvalidBillRecipientsException extends FeeBillException {
        private InvalidBillRecipientsException(String message, String code) {
            super(message, HttpStatus.BAD_REQUEST, code);
        }

        public static InvalidBillRecipientsException notAllowedForAllMembers() {
            return new InvalidBillRecipientsException(
                    "전체 회원 정책에는 청구 대상 회원을 지정할 수 없습니다.", "MEMBER_IDS_NOT_ALLOWED");
        }

        public static InvalidBillRecipientsException requiredForSelectedMembers() {
            return new InvalidBillRecipientsException(
                    "특정 회원 정책은 청구 대상 회원을 1명 이상 지정해야 합니다.", "MEMBER_IDS_REQUIRED");
        }

        public static InvalidBillRecipientsException notClubMembers() {
            return new InvalidBillRecipientsException(
                    "청구 대상에 이 동아리 회원이 아닌 사용자가 포함되어 있습니다.", "INVALID_BILL_RECIPIENTS");
        }
    }

    // SELECTED 발행에서 새로 생성된 청구가 0건 — 선택 회원이 이미 전원 발행됨(409).
    public static class NoBillsCreatedException extends FeeBillException {
        private static final String MESSAGE = "새로 생성된 청구가 없습니다. 선택한 회원이 이미 모두 발행되었습니다.";

        public NoBillsCreatedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
```

- [ ] **Step 6: 리포지토리 쿼리 추가**

`FeeBillRepository.java`에 SELECTED 발행 쿼리 추가(`bulkInsertBills` 다음). import에 `java.util.Collection` 추가:

```java
    // SELECTED_MEMBERS 발행: 활성 회원 중 지정된 user_id 만 대상으로 단일 원자 INSERT 한다.
    // RETURNING user_id 로 '실제로 새로 INSERT 된' user_id 만 받는다(ON CONFLICT 로 스킵된 행은 RETURNING 에 잡히지 않음).
    // @Modifying 을 붙이지 않는다 — getResultList 로 반환행을 받아야 하며, 네이티브 쿼리라 Hibernate 가 실행 전 세션을 flush 한다.
    @Query(value = """
            INSERT INTO fee_bill (club_id, user_id, fee_policy_id, amount, billing_period,
                                  billing_start_date, billing_end_date, due_date, status)
            SELECT :clubId, cm.user_id, :policyId, :amount, :billingPeriod,
                   :startDate, :endDate, :dueDate, 'PENDING'
            FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.deleted_at IS NULL AND cm.user_id IN (:memberIds)
            ORDER BY cm.user_id
            ON CONFLICT (fee_policy_id, user_id, billing_start_date)
              WHERE deleted_at IS NULL AND status <> 'CANCELLED'
            DO NOTHING
            RETURNING user_id
            """, nativeQuery = true)
    List<Long> bulkInsertBillsForMembers(@Param("clubId") Long clubId, @Param("policyId") Long policyId,
                                         @Param("amount") Long amount, @Param("billingPeriod") String billingPeriod,
                                         @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate,
                                         @Param("dueDate") LocalDate dueDate,
                                         @Param("memberIds") Collection<Long> memberIds);
```

> 대안(만약 Hibernate가 `INSERT … RETURNING`을 `getResultList`로 실행하지 못하면): `@Modifying` INSERT(반환 int)는 두고, 발행 직전에 "활성 회원 중 그 회차 미발행자"를 구하는 SELECT(`SELECT cm.user_id FROM club_member cm WHERE cm.club_id=:clubId AND cm.deleted_at IS NULL AND cm.user_id IN (:memberIds) AND NOT EXISTS (SELECT 1 FROM fee_bill fb WHERE fb.fee_policy_id=:policyId AND fb.user_id=cm.user_id AND fb.billing_start_date=:startDate AND fb.deleted_at IS NULL AND fb.status<>'CANCELLED')`)로 createdUserIds를 산출한다(정책 비관락이 동시 발행을 직렬화하므로 결정적). 1차 구현은 RETURNING으로 하고 Step 10에서 런타임 검증한다.

`ClubMemberRepository.java`에 소속 이력 검증 쿼리 추가(`countActiveByClubId` 다음). `java.util.Collection`은 이미 import됨:

```java
    /**
     * 청구 대상 검증용: soft-delete(탈퇴) 포함, 이 동아리의 멤버였던 user_id 집합을 반환한다.
     * @SQLRestriction 을 우회하는 네이티브 쿼리라 탈퇴 회원도 포함된다 — 요청 memberIds 중 이 집합에
     * 없는 id 는 타 동아리/미존재(IDOR)로 400 처리하고, 탈퇴 회원은 발행 단계(활성 join)에서 자연 제외한다.
     */
    @Query(value = """
            SELECT DISTINCT cm.user_id FROM club_member cm
            WHERE cm.club_id = :clubId AND cm.user_id IN (:userIds)
            """, nativeQuery = true)
    List<Long> findClubMemberUserIdsIncludingDeleted(@Param("clubId") Long clubId,
                                                     @Param("userIds") Collection<Long> userIds);
```

- [ ] **Step 7: 서비스 generate() 분기 구현**

`GeneralFeeBillService.java` — import에 `com.duing.domain.fee.entity.FeeTargetType`, `java.util.HashSet`, `java.util.List`, `java.util.Set` 추가. `generate`를 분기형으로 교체하고 ALL/SELECTED 헬퍼와 이벤트 헬퍼를 추가한다(`autoIssueMonthly`·`cancel`·기타 메서드는 그대로 둔다):

```java
    @Override
    @Transactional
    public GenerateBillsResult generate(GenerateBillsCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 비관적 잠금: 발행 도중 정책 비활성화·삭제(update/delete)와의 경합을 직렬화한다.
        FeePolicy policy = feePolicyRepository.findByIdAndClubIdForUpdate(command.policyId(), command.clubId())
                .orElseThrow(FeePolicyException.FeePolicyNotFoundException::new);
        if (!policy.isActive()) {
            throw new FeePolicyException.InactiveFeePolicyException();
        }
        BillingPeriodResolver.Resolved resolved = resolve(policy.getBillingType(), command);
        validateDueDate(resolved, command.dueDate(), policy.getBillingType());

        if (policy.getTargetType() == FeeTargetType.SELECTED_MEMBERS) {
            return generateForSelectedMembers(command, policy, resolved);
        }
        return generateForAllMembers(command, policy, resolved);
    }

    // ALL_MEMBERS: 활성 회원 전원에게 발행(기존 동작). created=0 은 멱등으로 그대로 허용(409 없음).
    private GenerateBillsResult generateForAllMembers(GenerateBillsCommand command, FeePolicy policy,
                                                      BillingPeriodResolver.Resolved resolved) {
        if (command.memberIds() != null && !command.memberIds().isEmpty()) {
            throw FeeBillException.InvalidBillRecipientsException.notAllowedForAllMembers();
        }
        int created = feeBillRepository.bulkInsertBills(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate());
        long activeCount = clubMemberRepository.countActiveByClubId(command.clubId());
        int skipped = (int) Math.max(0L, activeCount - created); // 동시 멤버 변동으로 음수가 되지 않게 클램프
        log.info("fee bills generated(all): actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(), created, skipped);
        publishIssuedEventIfAny(command.clubId(), policy.getId(), resolved, created);
        return new GenerateBillsResult(created, skipped, List.of());
    }

    // SELECTED_MEMBERS: 지정 회원만 발행. created=0 이면 409(선택 회원 전원 이미 발행).
    private GenerateBillsResult generateForSelectedMembers(GenerateBillsCommand command, FeePolicy policy,
                                                           BillingPeriodResolver.Resolved resolved) {
        List<Long> requested = command.memberIds();
        if (requested == null || requested.isEmpty()) {
            throw FeeBillException.InvalidBillRecipientsException.requiredForSelectedMembers();
        }
        List<Long> memberIds = requested.stream().distinct().toList();
        // 타 동아리/미존재 id 차단(IDOR). 탈퇴 회원은 이 집합에 포함되어 400 을 면하고, 발행 단계(활성 join)에서 제외된다.
        Set<Long> clubMemberIds = new HashSet<>(
                clubMemberRepository.findClubMemberUserIdsIncludingDeleted(command.clubId(), memberIds));
        if (!clubMemberIds.containsAll(memberIds)) {
            throw FeeBillException.InvalidBillRecipientsException.notClubMembers();
        }
        List<Long> createdUserIds = feeBillRepository.bulkInsertBillsForMembers(
                command.clubId(), policy.getId(), policy.getAmount(), resolved.billingPeriod(),
                resolved.startDate(), resolved.endDate(), resolved.dueDate(), memberIds);
        if (createdUserIds.isEmpty()) {
            throw new FeeBillException.NoBillsCreatedException();
        }
        Set<Long> createdSet = new HashSet<>(createdUserIds);
        List<Long> skippedUserIds = memberIds.stream().filter(userId -> !createdSet.contains(userId)).toList();
        log.info("fee bills generated(selected): actorId={}, clubId={}, policyId={}, period={}, created={}, skipped={}",
                command.actorId(), command.clubId(), policy.getId(), resolved.billingPeriod(),
                createdUserIds.size(), skippedUserIds.size());
        publishIssuedEventIfAny(command.clubId(), policy.getId(), resolved, createdUserIds.size());
        return new GenerateBillsResult(createdUserIds.size(), skippedUserIds.size(), skippedUserIds);
    }

    // 새 청구가 있을 때만 발행 알림을 fan-out 한다(billId dedup 으로 재알림은 리스너에서 흡수).
    private void publishIssuedEventIfAny(Long clubId, Long policyId, BillingPeriodResolver.Resolved resolved, int created) {
        if (created > 0) {
            String clubName = clubRepository.findById(clubId).map(Club::getName).orElse("동아리");
            eventPublisher.publishEvent(new FeeBillsIssuedEvent(
                    clubId, clubName, policyId, resolved.billingPeriod(),
                    resolved.startDate(), resolved.dueDate()));
        }
    }
```

`autoIssueMonthly`는 자체 dueDate 산출 로직이 있어 `publishIssuedEventIfAny`로 합치지 않는다 — 기존 코드 그대로 유지한다.

- [ ] **Step 8: 컨트롤러/API 확인**

`LeaderFeeBillController.generate`와 `LeaderFeeBillApi.generate`는 `@Valid @RequestBody GenerateBillsRequest`를 받아 `request.toCommand(...)`를 호출하므로 **시그니처 변경 불필요**. 변경 없음을 확인만 한다.

- [ ] **Step 9: 발행 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.LeaderFeeBillControllerTest"`
Expected: PASS — 신규 SELECTED 케이스 7개 + **기존 ALL/멱등/동시성 케이스 전부**(ALL은 409 가드 없음, created=0/201 유지).

- [ ] **Step 10: 회비 도메인 전체 회귀**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.*"`
Expected: BUILD SUCCESSFUL. (RETURNING 쿼리 런타임 검증 포함 — 실패 시 Step 6의 대안으로 전환.)

- [ ] **Step 11: 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee/controller/dto/request/GenerateBillsRequest.java \
        backend/src/main/java/com/duing/domain/fee/service/dto/command/GenerateBillsCommand.java \
        backend/src/main/java/com/duing/domain/fee/service/dto/query/GenerateBillsResult.java \
        backend/src/main/java/com/duing/domain/fee/controller/dto/response/GenerateBillsResponse.java \
        backend/src/main/java/com/duing/domain/fee/exception/FeeBillException.java \
        backend/src/main/java/com/duing/domain/fee/repository/FeeBillRepository.java \
        backend/src/main/java/com/duing/domain/clubmember/repository/ClubMemberRepository.java \
        backend/src/main/java/com/duing/domain/fee/service/GeneralFeeBillService.java \
        backend/src/test/java/com/duing/domain/fee/LeaderFeeBillControllerTest.java
git commit -m "feat(backend): 특정 회원(SELECTED) 청구 발행·대상 검증·skippedUserIds·created 0 방지 추가"
```

---

## Task 4: FE 정책 측 — 타입·스키마·정책 폼·목록 (한 번에 green)

**Files:**
- Modify: `frontend/packages/types/src/fee.ts`
- Modify: `frontend/packages/schemas/src/index.ts`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/CreatePolicyDialog.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/PolicyList.tsx`
- Test: `frontend/apps/web/test/manage/` (FeePolicy/발행결과 픽스처 갱신 + 정책 폼 케이스)

- [ ] **Step 1: fee 타입 확장**

`frontend/packages/types/src/fee.ts` — `BillingType` 근처(상단)에 `FeeTargetType` 추가:

```ts
export type FeeTargetType = 'ALL_MEMBERS' | 'SELECTED_MEMBERS';
```

`FeePolicy`에 `targetType`(필수) 추가:

```ts
export type FeePolicy = {
  id: number;
  name: string;
  amount: number;
  billingType: BillingType;
  targetType: FeeTargetType;
  active: boolean;
  autoIssue: boolean;
  issueDay: number | null;
  dueDay: number | null;
};
```

`CreateFeePolicyPayload`에 `targetType`(필수) 추가:

```ts
export type CreateFeePolicyPayload = {
  name: string;
  amount: number;
  billingType: BillingType;
  targetType: FeeTargetType;
  autoIssue?: boolean;
  issueDay?: number;
  dueDay?: number;
};
```

`GenerateBillsResult`에 `skippedUserIds` 추가:

```ts
// GenerateBillsResponse(created, skipped, skippedUserIds) 미러.
export type GenerateBillsResult = { created: number; skipped: number; skippedUserIds: number[] };
```

`GenerateBillsPayload`에 `memberIds`(선택) 추가:

```ts
export type GenerateBillsPayload = {
  billingPeriod: string;
  billingStartDate?: string;
  billingEndDate?: string;
  dueDate?: string;
  memberIds?: number[]; // SELECTED_MEMBERS 정책 발행 시 대상 회원의 userId 목록
};
```

`UpdateFeePolicyPayload`(`Partial<CreateFeePolicyPayload> & { active?: boolean }`)는 자동으로 `targetType?`를 포함하나 **수정 시 전송하지 않는다**(불변) — 별도 변경 없음.

- [ ] **Step 2: createFeePolicySchema 확장**

`frontend/packages/schemas/src/index.ts` — `createFeePolicySchema`에 `targetType` 필드와 superRefine 검증 추가:

```ts
export const createFeePolicySchema = z
  .object({
    name: z.string().min(1, '정책 이름은 필수입니다.').max(100, '정책 이름은 100자 이하여야 합니다.'),
    amount: z.coerce
      .number({ invalid_type_error: '금액은 숫자여야 합니다.' })
      .int('금액은 정수여야 합니다.')
      .min(0, '금액은 0 이상이어야 합니다.'),
    billingType: z.enum(['MONTHLY', 'SEMESTER', 'YEARLY', 'ONE_TIME'], {
      errorMap: () => ({ message: '회비 유형을 선택해주세요.' }),
    }),
    targetType: z.enum(['ALL_MEMBERS', 'SELECTED_MEMBERS'], {
      errorMap: () => ({ message: '청구 대상을 선택해주세요.' }),
    }),
    autoIssue: z.boolean().default(false),
    issueDay: optionalDay('발행일'),
    dueDay: optionalDay('마감일'),
  })
  .superRefine((value, ctx) => {
    if (!value.autoIssue) {
      return;
    }
    if (value.targetType !== 'ALL_MEMBERS') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoIssue'],
        message: '자동 발행은 전체 회원 정책에서만 설정할 수 있습니다.',
      });
      return;
    }
    if (value.billingType !== 'MONTHLY') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoIssue'],
        message: '자동 발행은 매월(MONTHLY) 정책에서만 설정할 수 있습니다.',
      });
      return;
    }
    if (value.issueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['issueDay'], message: '발행일을 입력해 주세요.' });
    }
    if (value.dueDay === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDay'], message: '마감일을 입력해 주세요.' });
    }
    if (value.issueDay !== undefined && value.dueDay !== undefined && value.dueDay < value.issueDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDay'],
        message: '마감일은 발행일과 같거나 이후여야 합니다.',
      });
    }
  });
```

`CreateFeePolicyInput`(z.infer)은 자동으로 targetType을 포함 — 추가 변경 불필요.

- [ ] **Step 3: CreatePolicyDialog — defaultValues + watch + 자동발행 조건**

`CreatePolicyDialog.tsx` — `useForm` defaultValues에 targetType 추가:

```ts
    defaultValues: policy
      ? {
          name: policy.name,
          amount: policy.amount,
          billingType: policy.billingType,
          targetType: policy.targetType,
          autoIssue: policy.autoIssue,
          issueDay: policy.issueDay ?? undefined,
          dueDay: policy.dueDay ?? undefined,
        }
      : {
          name: '',
          amount: 0,
          billingType: 'MONTHLY',
          targetType: 'ALL_MEMBERS',
          autoIssue: false,
          issueDay: undefined,
          dueDay: undefined,
        },
```

`watchedBillingType`/`watchedAutoIssue` 근처에 targetType watch와 자동발행 노출 조건을 추가:

```ts
  const watchedBillingType = watch('billingType');
  const watchedAutoIssue = watch('autoIssue');
  const watchedTargetType = watch('targetType');
  const effectiveBillingType = isEditMode ? policy.billingType : watchedBillingType;
  const effectiveTargetType = isEditMode ? policy.targetType : watchedTargetType;
  // 자동발행은 ALL_MEMBERS + MONTHLY 정책만.
  const showAutoIssue = effectiveBillingType === 'MONTHLY' && effectiveTargetType === 'ALL_MEMBERS';
```

- [ ] **Step 4: CreatePolicyDialog — 청구 대상 UI**

회비 유형 블록 다음, 자동발행 블록(`{showAutoIssue && ...}`) 앞에 삽입:

```tsx
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">청구 대상</span>
            {isEditMode ? (
              <p
                className="rounded-md border border-line bg-graysoft px-4 py-3 text-sm text-charcoal-2"
                aria-readonly="true"
              >
                {policy.targetType === 'SELECTED_MEMBERS' ? '특정 회원' : '전체 회원'}
                <span className="ml-2 text-xs text-charcoal-3">
                  (청구 대상은 변경할 수 없습니다. 변경하려면 새 정책을 만드세요.)
                </span>
              </p>
            ) : (
              <div className="flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-3 text-sm">
                  <input
                    type="radio"
                    value="ALL_MEMBERS"
                    {...register('targetType', {
                      onChange: () => {
                        setValue('autoIssue', false);
                        setValue('issueDay', undefined);
                        setValue('dueDay', undefined);
                      },
                    })}
                    className="accent-ink"
                  />
                  전체 회원
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-3 text-sm">
                  <input
                    type="radio"
                    value="SELECTED_MEMBERS"
                    {...register('targetType', {
                      onChange: () => {
                        // 특정 회원 정책은 자동발행 불가 → 관련 값 리셋.
                        setValue('autoIssue', false);
                        setValue('issueDay', undefined);
                        setValue('dueDay', undefined);
                      },
                    })}
                    className="accent-ink"
                  />
                  특정 회원
                </label>
              </div>
            )}
            <p className="mt-1 text-xs text-charcoal-3">
              특정 회원은 발행할 때마다 대상 회원을 선택합니다(MT·행사 참가비 등).
            </p>
            {errors.targetType && <p className="mt-1 text-xs text-coral">{errors.targetType.message}</p>}
          </div>
```

- [ ] **Step 5: CreatePolicyDialog — 생성 payload에 targetType**

생성 분기 payload에 targetType 추가(수정 분기는 넣지 않음 — 불변):

```ts
    const payload: CreateFeePolicyPayload = {
      name: formData.name.trim(),
      amount: formData.amount,
      billingType: formData.billingType,
      targetType: formData.targetType,
      autoIssue: formData.autoIssue,
    };
```

- [ ] **Step 6: PolicyList — targetType 배지**

`PolicyList.tsx`의 `PolicyRow` 정책 이름 영역에 SELECTED일 때 배지 추가:

```tsx
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">
          {policy.name}
          {policy.targetType === 'SELECTED_MEMBERS' && (
            <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-ink">
              특정 회원
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-charcoal-3">
          {billingTypeLabel(policy.billingType)} · {formatWon(policy.amount)}
        </p>
      </div>
```

- [ ] **Step 7: 테스트 픽스처 갱신(필수) + 정책 폼 케이스**

FeePolicy를 만드는 모든 FE 테스트 픽스처에 `targetType`을, mocked `GenerateBillsResult`에 `skippedUserIds`를 추가한다(필수 필드화 → 타입 에러 방지).

Run: `grep -rln "billingType\|skipped" frontend/apps/web/test/manage`
각 매칭 파일에서:
- FeePolicy 리터럴/빌더 → `targetType: 'ALL_MEMBERS'` 추가(SELECTED 케이스를 새로 쓰면 그 픽스처는 `'SELECTED_MEMBERS'`).
- `GenerateBillsResult` 모킹(예: `{ created, skipped }`) → `skippedUserIds: []` 추가.

정책 폼 테스트가 있으면 케이스 추가(있는 테스트 스타일에 맞춰): "특정 회원을 선택하면 자동발행 토글이 사라진다", "전체 회원 + 매월이면 자동발행 토글이 보인다".

- [ ] **Step 8: 타입체크 + 테스트**

Run: `cd frontend && pnpm -C apps/web typecheck && pnpm -C apps/web test -- --run`
Expected: 타입 에러 0, 테스트 PASS. (GenerateBillsDialog는 새 필드를 아직 안 쓰지만 기존 `result.created/skipped` 사용이라 컴파일·통과 유지.)

- [ ] **Step 9: 커밋**

```bash
git add frontend/packages/types/src/fee.ts frontend/packages/schemas/src/index.ts \
        frontend/apps/web/app/manage/clubs/'[clubId]'/fees/_components/CreatePolicyDialog.tsx \
        frontend/apps/web/app/manage/clubs/'[clubId]'/fees/_components/PolicyList.tsx \
        frontend/apps/web/test
git commit -m "feat(frontend): 회비 정책 청구 대상 타입·스키마·폼 라디오·목록 배지 추가"
```

---

## Task 5: FE 발행 측 — SELECTED 회원 멀티셀렉트 + skipped 안내

**Files:**
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/GenerateBillsDialog.tsx`
- Test: `frontend/apps/web/test/manage/` (발행 다이얼로그 테스트)

- [ ] **Step 1: import + 회원 선택 상태**

`GenerateBillsDialog.tsx` 상단 import 보강:

```ts
import { useState } from 'react';
import { useClubFeePoliciesQuery, useClubMembersQuery, useGenerateBillsMutation } from '@duing/hooks';
import type { FeePolicy, GenerateBillsPayload } from '@duing/types';
```

`GenerateBillsForm` 함수 안 `useForm` 위에 회원 선택 상태/조회 추가:

```ts
function GenerateBillsForm({ clubId, policy, onClose }: GenerateBillsFormProps) {
  const generateBills = useGenerateBillsMutation(clubId);
  const { addToast } = useToast();

  const isSelected = policy.targetType === 'SELECTED_MEMBERS';
  const { data: members, isLoading: membersLoading } = useClubMembersQuery(isSelected ? clubId : undefined);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);

  const toggleMember = (userId: number) => {
    setMemberError(null);
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };
```

- [ ] **Step 2: onSubmit — memberIds 병합 + 검증 + skipped 안내**

`onSubmit`을 교체:

```ts
  const onSubmit = (formData: GenerateBillsInput) => {
    if (isSelected && selectedUserIds.length === 0) {
      setMemberError('청구할 회원을 1명 이상 선택해 주세요.');
      return;
    }
    const payload: GenerateBillsPayload = {
      ...toGenerateBillsPayload(formData),
      ...(isSelected ? { memberIds: selectedUserIds } : {}),
    };
    generateBills.mutate(
      { policyId: policy.id, payload },
      {
        onSuccess: (result) => {
          const skippedNote =
            result.skippedUserIds.length > 0 ? ` · 제외 ${result.skippedUserIds.length}` : '';
          addToast(`발행 완료 (신규 ${result.created}${skippedNote})`);
          onClose();
        },
      },
    );
  };
```

- [ ] **Step 3: 멀티셀렉트 UI 렌더**

폼 안 `<input type="hidden" {...register('billingType')} />` 다음에 SELECTED 정책일 때만 렌더:

```tsx
      {isSelected && (
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">
            청구 대상 회원 <span className="text-coral">*</span>
          </span>
          {membersLoading ? (
            <p className="text-sm text-charcoal-3">회원을 불러오는 중…</p>
          ) : !members || members.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-charcoal-2">
              활성 회원이 없습니다.
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {members.map((member) => (
                <label
                  key={member.userId}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-graysoft"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(member.userId)}
                    onChange={() => toggleMember(member.userId)}
                    className="h-4 w-4 accent-ink"
                  />
                  <span className="text-ink">{member.name}</span>
                  <span className="text-xs text-charcoal-3">{member.studentId}</span>
                </label>
              ))}
            </div>
          )}
          {selectedUserIds.length > 0 && (
            <p className="mt-1 text-xs text-charcoal-3">{selectedUserIds.length}명 선택됨</p>
          )}
          {memberError && <p className="mt-1 text-xs text-coral">{memberError}</p>}
        </div>
      )}
```

- [ ] **Step 4: 안내 문구 일반화**

`DialogDescription`을 대상 일반화로 교체:

```tsx
          <DialogDescription className="text-sm text-charcoal-2">
            정책을 선택하고 회차·기간을 입력해 청구서를 발행합니다. 특정 회원 정책은 대상 회원을 선택합니다.
          </DialogDescription>
```

- [ ] **Step 5: 테스트 추가**

발행 다이얼로그 테스트의 `@duing/hooks` 모킹에 `useClubMembersQuery`를 추가하고, SELECTED 정책(`targetType: 'SELECTED_MEMBERS'`) 선택 시 회원 체크박스가 노출되고, 미선택 제출이 차단되며, 선택 후 제출 payload에 `memberIds`(userId 배열)가 담기는 케이스를 추가한다. ALL 발행 테스트(`targetType: 'ALL_MEMBERS'`)는 회원 UI가 안 보이고 그대로 통과해야 한다. 회원 모킹 데이터는 `ClubMember`(`memberId/userId/name/studentId/role/joinedAt`) 형태.

- [ ] **Step 6: 타입체크 + 테스트 + 린트**

Run: `cd frontend && pnpm -C apps/web typecheck && pnpm -C apps/web test -- --run && pnpm -C apps/web lint`
Expected: 타입 에러 0, 테스트 PASS, 변경 파일 린트 경고 0.

- [ ] **Step 7: 커밋**

```bash
git add frontend/apps/web/app/manage/clubs/'[clubId]'/fees/_components/GenerateBillsDialog.tsx \
        frontend/apps/web/test
git commit -m "feat(frontend): 특정 회원 청구 발행 시 회원 멀티셀렉트 및 제외 안내 추가"
```

---

## 최종 검증 (전 Task 완료 후)

- [ ] BE 전체: `cd backend && ./gradlew test` → BUILD SUCCESSFUL
- [ ] FE 전체: `cd frontend && pnpm -C apps/web test -- --run && pnpm -C apps/web typecheck` → 전부 PASS, 타입 0
- [ ] 설계서 대조: targetType 불변·autoIssue⟹ALL·created=0(SELECTED만)·skippedUserIds·타동아리 400·탈퇴 skip·멱등 인덱스 무변경·하류 무수정·Out of Scope 준수 확인

## Out of Scope (재확인)

- 선택 회원 명단의 정책 영속화(`fee_policy_member` 매핑 테이블)
- SELECTED_MEMBERS 자동(월) 발행
- `APPLICANTS` 타입(행사/모집 신청자 자동 청구)
- 휴면/정지용 `ClubMember.status` enum 신설("비활성"은 soft-delete로 해석)
- 멱등 인덱스·하류(영수증/납부/장부) 변경
- 알림 이벤트/리스너 변경(billId dedup이 재알림을 이미 방지)
