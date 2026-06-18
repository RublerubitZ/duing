# 회비 청구 대상(Target Scope) 설계서

> 작성일: 2026-06-18
> 도메인: `backend/.../domain/fee`, `frontend/.../fees`
> 선행: 회비 Sprint 1~4(정책·청구·납부·영수증·자동발행), 금전출납부(Sprint 5)

## 1. 배경 / 목표

현재 회비 시스템은 **정책 생성 → 동아리 활성 회원 전체 청구**를 전제로 한다. 발행 로직(`FeeBillRepository.bulkInsertBills`)이 `INSERT … SELECT FROM club_member WHERE club_id=:clubId AND deleted_at IS NULL … ON CONFLICT DO NOTHING` 하나로 "대상 선별 = 삽입"을 수행하며, 발행 요청은 회원을 지정하는 필드를 전혀 받지 않는다.

그러나 MT 참가비·회식비·단체복·굿즈·스터디/행사 참가비 같은 **일회성 회비는 전체 회원 대상이 아니라 참여자만 청구**하는 것이 자연스럽다. 지금은 전체 발행 후 비참여자 청구를 일일이 취소해야 하는 비효율이 있다.

**목표**: 회비 정책에 **청구 대상(targetType)** 개념을 추가해, 운영진이 "전체 회원 회비"와 "특정 회원 참가비"를 같은 회비 시스템 안에서 구분 발행할 수 있게 한다.

## 2. 핵심 설계 결정 (Stateless)

선택 회원 명단을 **정책에 영속화하지 않는다**. 명단은 **발행 요청마다 `memberIds`로 전달**받는다. 정책의 `targetType`은 "이 정책은 발행 시 memberIds가 필수/금지"라는 **검증 게이트 + 표시용 메타**로만 동작한다.

근거:
- 스펙의 SELECTED 예시(MT·회식·단체복 등)는 전부 **일회성 수동 발행**이라 명단 영속화가 불필요하다(YAGNI).
- 멱등 키 `(fee_policy_id, user_id, billing_start_date)`가 이미 `user_id`를 포함해, 부분집합 발행·인원 추가 발행이 자연히 멱등이다.
- 명단을 정책에 저장하면 회원 가입/탈퇴 시 명단 동기화 설계가 추가로 필요해 현재 요구를 초과한다.

**파생 규칙**: 명단을 저장하지 않으므로 **자동 월발행 크론은 SELECTED_MEMBERS를 처리할 수 없다** → `autoIssue`는 `ALL_MEMBERS`에서만 허용한다(§4).

## 3. 데이터 모델

### 3.1 enum

신규 `backend/.../domain/fee/entity/FeeTargetType.java`:

```java
public enum FeeTargetType {
    ALL_MEMBERS,
    SELECTED_MEMBERS
}
```

`BillingType.java`와 동일한 한 줄 enum 스타일.

### 3.2 FeePolicy 엔티티

`FeePolicy`에 필드 추가. `ReportTargetType`/`Report` 매핑 선례를 따른다.

```java
@Enumerated(EnumType.STRING)
@Column(name = "target_type", nullable = false, length = 30)
private FeeTargetType targetType;
```

- 정적팩토리 `create(clubId, name, amount, billingType, targetType)` 시그니처에 `targetType` 추가(코어 필드로 승격, DB DEFAULT와 정합 위해 생성 시 항상 채움).
- `targetType`은 **생성 후 변경 불가**. `update(...)` 메서드는 `targetType`을 인자로 받지 않는다(billingType 잠금과 동일한 보수적 정책).

### 3.3 마이그레이션 V68

`backend/src/main/resources/db/migration/V68__fee_policy_target_type.sql` 신규. 기존 V60/V65 **미수정**.

```sql
ALTER TABLE fee_policy
    ADD COLUMN target_type VARCHAR(30) NOT NULL DEFAULT 'ALL_MEMBERS';

ALTER TABLE fee_policy
    ADD CONSTRAINT chk_fee_policy_target_type
    CHECK (target_type IN ('ALL_MEMBERS', 'SELECTED_MEMBERS'));

-- 자동발행은 전체 회원만 가능(명단 미영속 → 크론이 선택 회원을 알 수 없음)
ALTER TABLE fee_policy
    ADD CONSTRAINT chk_fee_policy_auto_issue_all_members
    CHECK (auto_issue = FALSE OR target_type = 'ALL_MEMBERS');
```

- 기존 행은 `DEFAULT 'ALL_MEMBERS'`로 백필되어 현행 동작 보존.
- `length=30`은 `Report.target_type` 선례와 동일. `ddl-auto=validate`가 엔티티 `@Column(length=30, nullable=false)`와 DB 정의 정합을 강제하므로 정확히 일치시킬 것.

## 4. 정책 생성 / 수정 규칙

- **생성**: `targetType` 필수(`@NotNull`, 한국어 메시지). 미지정 시 기본값을 프론트가 `ALL_MEMBERS`로 보냄(서버는 NOT NULL 요구).
- **자동발행 정합**: `autoIssue=true`이면 `targetType=ALL_MEMBERS`여야 한다. 위반 시 서비스 레벨 선검증 예외(기존 `validateAutoIssue` 흐름에 한 줄 추가, `AutoIssueRequiresAllMembersException` 류). DB `chk_fee_policy_auto_issue_all_members`와 이중 방어.
- **수정**: `targetType`은 수정 불가(요청 DTO에 포함하더라도 무시하거나, 프론트가 읽기전용으로 잠금). billingType과 동일.

DTO 전파 사슬(4 record 동시 변경):
`CreateFeePolicyRequest` → `CreateFeePolicyCommand` → `FeePolicyQuery`(`from(FeePolicy)`) → `FeePolicyResponse`(`from(FeePolicyQuery)`). `UpdateFeePolicyRequest`/`UpdateFeePolicyCommand`에는 `targetType`을 추가하지 않는다(수정 불가).

## 5. 청구 발행 API

엔드포인트는 동일: `POST /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}/bills`.

### 5.1 요청 변경

`GenerateBillsRequest`에 필드 추가:

```java
private List<Long> memberIds; // SELECTED_MEMBERS일 때만 사용
```

`GenerateBillsCommand`에도 동일 전파. `toCommand(clubId, actorId, policyId)`에 인자로 합류.

### 5.2 검증 규칙

| 상황 | 결과 |
|------|------|
| `ALL_MEMBERS` 정책 + `memberIds` 전달(비어있지 않음) | **400** (금지) |
| `SELECTED_MEMBERS` 정책 + `memberIds` 없음/빈 배열 `[]` | **400** (필수) |
| `SELECTED_MEMBERS` + `memberIds` 길이 > 500 | **400** (`@Size(max=500)`) |
| `memberIds`에 **이 동아리 소속 이력이 없는 id**(타 동아리·미존재) | **400** (`InvalidBillRecipientsException`) |
| `memberIds`에 **탈퇴(soft-delete)한 옛 회원** id | 거부 안 함 → 발행에서 제외 → `skippedUserIds`로 보고 |
| `memberIds`에 **이미 그 회차 발행된** 활성 회원 | ON CONFLICT로 제외 → `skippedUserIds`로 보고 |

검증 순서: (1) memberIds 존재/금지·크기 → (2) 소속 이력 검증(400) → (3) 발행 → (4) created=0 가드(409, §5.4).

**소속 이력 검증**: soft-delete를 무시하는 네이티브 쿼리 1개 신설 — 예) `findClubMemberUserIds(clubId, memberIds)`가 "상태 무관 이 동아리 멤버였던 user_id" 집합을 반환. `요청 memberIds − 반환집합`이 비어있지 않으면 타 동아리/미존재 id가 섞인 것 → `InvalidBillRecipientsException`(400). 탈퇴 회원은 이 집합에 포함되므로 400을 면하고, 이후 발행(활성 join)에서 자연 제외된다.

`@NotEmpty`/`@Size` 같은 단순 제약은 DTO 어노테이션, "ALL이면 memberIds 금지 / SELECTED면 필수" 같은 정책-의존 교차검증은 서비스 레벨에서 수행(현재 `GenerateBillsRequest`엔 교차검증 패턴이 없으므로 서비스가 정책을 조회한 뒤 판정).

권한·격리는 기존 그대로: `clubAuthService.requireManager(actorId, clubId)` 한 줄(인자 순서 `(userId, clubId)` 준수) + clubId 스코프.

### 5.3 발행 쿼리 & 멱등성

- `ALL_MEMBERS`: 기존 `bulkInsertBills` 그대로(`FROM club_member WHERE club_id AND deleted_at IS NULL`).
- `SELECTED_MEMBERS`: 변형 쿼리(예 `bulkInsertBillsForMembers`) — 동일 INSERT…SELECT에 `AND cm.user_id IN (:memberIds)` 추가. `ON CONFLICT (fee_policy_id, user_id, billing_start_date) WHERE deleted_at IS NULL AND status<>'CANCELLED' DO NOTHING` **그대로 유지**(부분 인덱스 술어를 ON CONFLICT에 명시해야 매칭됨).
- 두 경로 모두 `RETURNING user_id`를 추가해 **실제 새로 INSERT된 user_id 목록(createdUserIds)** 을 받는다. ON CONFLICT로 스킵된 행은 RETURNING에 잡히지 않으므로 정확.
- 멱등 인덱스(`uk_fee_bill_idem`)는 변경 불필요(이미 user_id 포함).

### 5.4 응답 & created=0 가드

`GenerateBillsResponse`를 `{created, skipped, skippedUserIds}`로 확장:

- `created = createdUserIds.size()`
- `SELECTED_MEMBERS`: `skippedUserIds = 요청 memberIds − createdUserIds`(탈퇴·기 발행 모두 포함), `skipped = skippedUserIds.size()`.
- `ALL_MEMBERS`: `skippedUserIds = []`(개별 열거 안 함), `skipped = max(0, countActiveByClubId − created)`(현행 유지).

**created=0 가드 (SELECTED_MEMBERS 한정)**: **`SELECTED_MEMBERS` 수동 발행에서 새로 생성된 청구가 0이면 409 Conflict**(신규 예외 `NoBillsCreatedException`, 메시지 "새로 생성된 청구가 없습니다. 선택한 회원이 이미 모두 발행되었습니다"). 운영진이 특정 회원을 골라 발행했는데 전원 이미 발행됨 = 무의미한 동작이므로 표면화한다.

> **`ALL_MEMBERS` 수동 발행은 기존 멱등(created=0 → 201) 동작을 그대로 유지한다.** 이유: 전체 발행은 재클릭·동시 발행이 정상 시나리오이고, 동시성 안전성 통합테스트(`concurrentGenerateIsIdempotent` 등 10스레드 중 9건이 created=0/201을 기대)가 이 계약에 의존한다. 여기에 409를 도입하면 멱등·동시성 계약이 깨진다. 따라서 가드는 **SELECTED 경로에만** 둔다.
> 자동 월발행 크론(`autoIssueMonthly`)은 ALL_MEMBERS 전용이고 `created=0`이 캐치업 정상이라 무음 no-op 유지(가드 없음).
> SELECTED 트레이드오프: 네트워크 재시도로 동일 SELECTED 요청이 재도달하면 409가 뜬다. 데이터는 안전(중복 청구 없음)하고 수동 확인 UI라 수용한다.

### 5.5 알림 fan-out (변경 없음)

기존 `FeeBillsIssuedListener`는 `notificationService.createIfAbsent(... dedupKey="FEE_BILL_ISSUED:b="+billId)`로 **billId 단위 멱등 알림**을 만든다. 그래서 SELECTED에서 같은 회차에 인원을 나눠 발행해도, 두 번째 발행 시 리스너가 그 회차 전체를 순회하더라도 **기존 회원의 알림은 dedup으로 재생성되지 않고 새 회원에게만 생성**된다. 즉 재알림 방지가 이미 보장되므로 이벤트·리스너를 **수정하지 않는다**. (`created>0`일 때만 이벤트 발행하는 현행 조건도 그대로 유지.)

## 6. 하류 영향 (없음)

영수증(`GeneralReceiptService`)·납부(`GeneralPaymentService`/`MatchedPaymentService`)·상태계산기(`FeeBillStatusCalculator`)·연체크론(`OverdueBillJob`)·조회(`FeeBillRepositoryImpl`)·금전출납부(`cashbook_entry`)는 모두 **단건 Bill**만 다루므로 targetType을 알 필요가 없다. SELECTED든 ALL이든 일단 생성된 FeeBill의 흐름은 동일하다. **무수정.**

## 7. 프론트엔드

- **타입**(`packages/types/src/fee.ts`): `FeeTargetType = 'ALL_MEMBERS'|'SELECTED_MEMBERS'`, `FeePolicy.targetType` 추가, `CreateFeePolicyPayload.targetType`(필수), `GenerateBillsPayload.memberIds?: number[]`, `GenerateBillsResult`에 `skippedUserIds: number[]`. `UpdateFeePolicyPayload`에는 targetType 미추가(수정 불가).
- **스키마**(`packages/schemas/src/index.ts`): `createFeePolicySchema`에 `targetType` enum + `superRefine`로 "autoIssue=true면 targetType=ALL_MEMBERS" 교차검증. `generateBillsSchema`/`toGenerateBillsPayload`에 SELECTED일 때 `memberIds` 최소 1명 검증·직렬화 추가(기존 `optionalDay` 전처리 스타일 참고).
- **CreatePolicyDialog**: billingType select 인근에 청구 대상 라디오(`전체 회원`/`특정 회원`). 수정 모드에선 targetType을 읽기전용 텍스트로 잠금(billingType 잠금과 동일).
- **GenerateBillsDialog**: 발행하려는 정책이 SELECTED면 **회원 멀티셀렉트**(팝오버+체크박스 리스트 신규 구성; `components/ui`에 멀티셀렉트 없음). 데이터 소스는 기존 `useClubMembersQuery(clubId)`. **선택값은 `userId`**(memberId 아님 — 청구는 user_id 기준). 발행 결과에서 `skippedUserIds`가 있으면 "N명은 이미 발행됨/대상 아님으로 제외" 토스트/안내.
- **PolicyList**: 각 정책 행에 `전체`/`특정` 배지(기존 배지 토큰 재사용).
- **hooks**(`packages/hooks/src/fee.ts`): 페이로드 형상만 확장, 시그니처/무효화 키(`feeQueryKeys.policies`) 변경 불필요.

## 8. 테스트 전략

**백엔드**
- 정책 생성: SELECTED 생성 성공, `autoIssue=true + SELECTED` 거부(서비스·DB CHECK).
- 발행 검증: ALL+memberIds 전달 400, SELECTED+빈 memberIds 400, 타 동아리 user_id 섞임 400, `@Size(max=500)` 초과 400.
- 발행 동작(SELECTED): 선택 회원만 created, 탈퇴 회원 섞임 → 그 회원만 skippedUserIds, 일부 기 발행 → 그 회원 skippedUserIds, **선택 회원 전원 기 발행 → 409 NoBillsCreated**.
- ALL 경로 멱등 회귀(불변): 기존 전체 발행·재발행 created=0/201·skipped 카운트·동시성 테스트가 **그대로 통과**해야 한다(ALL에는 409 가드 없음).
- 자동발행 크론: SELECTED 정책은 `autoIssue=true`로 만들 수 없어(생성·수정 400 + DB CHECK) 크론 대상이 되지 않음을 검증. ALL 캐치업 재실행 created=0 무음 no-op은 기존 동작 유지.
- 알림: 기존 billId dedup 테스트(`issuedNotificationForNewlyJoinedMemberOnly` 등)가 재알림 방지를 이미 커버 — 추가 변경/테스트 불필요.
- 격리/멱등: 타 동아리 정책 404, 동일 요청 재호출 안전성(409 동작 포함).

**프론트**
- targetType 라디오 렌더·수정 모드 잠금, SELECTED 선택 시 멀티셀렉트 노출, memberIds 미선택 시 제출 차단, 발행 payload에 userId 전달, skippedUserIds 안내, PolicyList 배지.

## 9. Out of Scope (이번 범위 아님)

- 선택 회원 **명단의 정책 영속화**(`fee_policy_member` 등 매핑 테이블).
- **SELECTED_MEMBERS의 자동(월) 발행** — 명단 미영속이라 구조적으로 불가, 의도적 제외.
- `APPLICANTS` 타입(행사/모집 신청자 자동 청구) — 향후 행사(Event) 도메인 도입 시 확장 포인트로만 남김.
- 휴면/정지용 **별도 `ClubMember.status` enum 신설** — "비활성"은 현행대로 soft-delete(탈퇴)로 해석.
- 멱등 인덱스·하류(영수증/납부/장부) 변경.

## 10. 마이그레이션 / 배포 노트

- V68 한 파일(컬럼 + CHECK 2개). 기존 행은 `ALL_MEMBERS` 백필로 무중단 호환.
- 신규 환경변수 없음.
- 엔티티-DB 타입 정합(`VARCHAR(30) NOT NULL`)이 `ddl-auto=validate` 게이트 — 길이/널 정확히 일치.
