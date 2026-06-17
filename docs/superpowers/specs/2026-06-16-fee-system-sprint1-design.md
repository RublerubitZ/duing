# 회비 관리 시스템 — Sprint 1 설계서

- 작성일: 2026-06-16
- 대상: Du-ing(두잉) 모노레포 (backend: Spring Boot 3.4 / Java 21, frontend: Next.js 15 / React 19)
- 범위: 회비 관리 시스템 **Sprint 1** (회비 정책 · 회비 청구 · 조회)
- 전제: 이 설계는 전체 PRD(2단계·4스프린트) 중 Sprint 1만 다룬다. Sprint 2~4(납부 처리·미납 자동화·대시보드·BANK API 자동매칭)는 본 문서의 "이후 스프린트" 절에 매핑만 기록한다.

---

> **개정 (2026-06-16 · 동시성·정합성 리뷰 반영):** 아래 6개 항목이 본문에 in-place로 반영되었다. 본문 서술이 정본이며, 이 노트는 변경 추적용이다.
> 1. **청구 발행 멱등 (§2·§4·§7):** `saveAll` 금지 → 단일 원자적 `INSERT ... SELECT FROM club_member ... ON CONFLICT DO NOTHING`(부분 유니크 인덱스 술어 명시). 충돌 흡수가 1차 메커니즘이며 "최종 방어선" 개념을 폐기한다.
> 2. **due_date 정합성 (§4·§5·§7·§8):** YEARLY 기본 마감일 고정 `01/31` 폐기(`max(발행월 말일, 기간 시작일)`로 산출), `due_date >= billing_start_date` 불변식(앱 + DB CHECK), 운영자가 명시한 `dueDate`의 과거값 차단(주입 `Clock`[Asia/Seoul], `== 오늘` 허용, ONE_TIME 면제).
> 3. **billing_type 불변 (§6·§7·§8):** 발행 이력(취소·soft-delete 포함)이 있으면 `billing_type` 변경 불가 → 409. `name`·`amount`·`active`만 수정.
> 4. **발행 요청 DTO (§6·§7·§9):** 다형성/`@JsonTypeInfo` 미채택(`policyId`가 이미 타입을 확정 → 본문 discriminator는 중복·불일치 위험·한국어 `@Valid` 우회). **단일 flat `GenerateBillsRequest` + 정책 로드 후 조건 검증.** 프론트는 선택 정책 기준 폼 레벨 union.
> 5. **동시성 테스트 (§10):** 10 스레드·100명 → 정확히 100건. "거짓 통과" 방지 장치(per-request TX·barrier·3중 단언) 포함.
> 6. **운영 보강 (§7·§10·§11):** 발행 감사 로그, 정책 lifecycle 경합(비관적 잠금), 공유 테스트 인프라 선결 작업.

---

## 1. 배경과 목표

두잉은 동아리·모임 통합 플랫폼이며, 운영진(회장·총무)의 회비 관리 업무를 자동화하는 것이 본 시스템의 목표다. Sprint 1은 그 토대로서 다음을 제공한다.

- 동아리별 **회비 정책** 정의 (월/학기/연/일회성)
- 정책 기반 **회비 청구 수동 발행** (활성 회원 일괄, 멱등)
- 총무용 **청구 현황 조회**와 회원용 **본인 회비 조회**

Sprint 1의 성공 기준: 총무가 화면에서 정책을 만들고, 한 회차의 청구를 일괄 발행하고, 누가 무엇을 청구받았는지 확인할 수 있다. 회원은 본인 청구 내역을 볼 수 있다. (실제 납부 체크·연체·집계·자동매칭은 이후 스프린트.)

## 2. 핵심 설계 결정 (확정)

1. **동아리 단위(club-scoped)**: 회비는 특정 동아리에 귀속된다. 회비 "관리자"는 그 동아리의 **LEADER(회장)·OFFICER(총무)** 이며, 전역 시스템 ADMIN은 회비 관리에 관여하지 않는다. 권한은 기존 `ClubAuthService.requireManager(userId, clubId)`(LEADER·OFFICER 허용)로 강제한다.
2. **금액은 정수 원(`BIGINT` / Java `long`)**: KRW는 소수 단위가 없으므로 `decimal`을 쓰지 않는다. 합계·수납률·부분납부 누적이 정수로 정확하다.
3. **청구 발행은 수동 트리거 + 멱등**: Sprint 1은 총무가 직접 "이 회차 청구 발행"을 실행한다. 자동 월 발행 크론은 Sprint 2에서 동일 도메인 로직을 호출만 하도록 얇게 붙인다.
4. **청구 대상은 `user_id` 스냅샷**: `club_member_id`가 아니라 `user_id`를 저장한다. 회원이 탈퇴(soft delete) 후 재가입해도 청구 이력이 보존되고 `/my/fees`를 `user_id` 기준으로 조회할 수 있다.
5. **금액 스냅샷**: 발행 시 `fee_policy.amount`를 `fee_bill.amount`에 복사한다. 이후 정책 금액이 바뀌어도 발행된 청구액은 불변이다.
6. **취소는 `CANCELLED` 상태**(soft delete가 아님): 취소 이력이 목록에 남고, 멱등 유니크 제약이 `CANCELLED`를 제외하므로 같은 회원·회차로 재발행할 수 있다.
7. **정책에 `due_day` 없음**: 마감일은 정책에 고정하지 않고 발행 시점에 결정한다. MONTHLY는 서버가 자동 산출, 학기/연/일회성은 발행 요청에서 기간·마감일을 명시한다.
8. **청구 발행은 단일 원자적 SQL**: 활성 회원을 앱으로 읽어 `saveAll`하지 않고, `INSERT INTO fee_bill SELECT ... FROM club_member ... ON CONFLICT DO NOTHING` 한 문장으로 발행한다(대상 선별과 삽입이 한 statement → 멤버 집합 TOCTOU 없음). 멱등성의 **1차 메커니즘**은 부분 유니크 인덱스 `uk_fee_bill_idem`이며, `saveAll`은 충돌 시 개별 row skip이 불가능하고 트랜잭션 전체가 롤백되므로 쓰지 않는다.
9. **`billing_type` 불변**: 정책으로 발행된 `fee_bill`이 하나라도 존재하면(취소·soft-delete 포함) `billing_type`은 변경할 수 없다(409). 이미 발행된 청구의 기간·회차·라벨 규칙과 충돌하기 때문이다. `name`·`amount`·`active`는 변경 가능하며, 금액은 스냅샷(5번)이라 기존 청구액에 영향이 없다.
10. **날짜는 주입된 `Clock`(Asia/Seoul) 기준**: 모든 기간·마감 산출과 검증은 `LocalDate.now()` 대신 주입된 `java.time.Clock`을 쓴다(테스트 결정성). 확정된 `due_date`는 `billing_start_date` 이후여야 하고, 운영자가 명시한 `dueDate`는 발행일보다 과거일 수 없다(§5.1).

## 3. 스코프

### In Scope (Sprint 1)
- 회비 정책 CRUD (동아리별 생성·수정·활성 토글·삭제)
- 회비 청구 수동 일괄 발행 (정책 + 회차/기간/마감 → 활성 회원 전원, 멱등)
- 개별 청구 취소 (`CANCELLED` 전이)
- 총무용 청구 현황 목록 조회 (회차·상태·회원 필터, 페이지네이션)
- 회원용 본인 회비 목록 조회 (`/my/fees`)
- 프론트 화면: `/manage/clubs/[clubId]/fees`(정책·청구 2탭), `/me/fees`

### Out of Scope (이후 스프린트, 본 Sprint에서 구현하지 않음)
- 납부 처리(수동 체크)·`PAID`/`PARTIAL_PAID` 전이, `payment` 테이블 → **Sprint 2**
- 미납/연체 자동화, 알림(인앱·이메일), `notification_log`, 자동 발행/연체 크론 → **Sprint 2**
- 집계 대시보드(수납률·미수금·총액 등) → **Sprint 2**
- BANK API 거래 수집·자동매칭·관리자 검토 큐·영수증, `bank_transaction`·`member_payment_code`·`bank_account` → **Sprint 3~4**
- 앱 푸시(FCM): 디바이스 토큰 인프라 자체가 없으므로 별도 구축 건 → **범위 외**
- 출석 연동 할인·포인트 차감·가상계좌·자동이체·카드결제·회계 장부·예산·AI 리포트 → 향후 확장(스키마가 막지 않도록만 설계)

## 4. 데이터 모델 (Flyway V60)

새 마이그레이션 파일 1개로 두 테이블을 생성한다. 기존 마이그레이션 수정 금지, snake_case, `TIMESTAMP WITH TIME ZONE`, `BIGSERIAL`, `VARCHAR + CHECK`(네이티브 ENUM 금지), FK `ON DELETE RESTRICT`, BaseEntity 표준 컬럼(`created_at`/`updated_at`/`deleted_at`), 그리고 **각 테이블 `ENABLE ROW LEVEL SECURITY`**(V59 패턴: 정책은 만들지 않음, 앱은 owner 역할로 접속하여 우회).

```sql
-- fee_policy : 동아리별 회비 정책
CREATE TABLE fee_policy (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    name          VARCHAR(100) NOT NULL,
    amount        BIGINT NOT NULL CHECK (amount >= 0),          -- 정수 원
    billing_type  VARCHAR(20) NOT NULL
                  CHECK (billing_type IN ('MONTHLY','SEMESTER','YEARLY','ONE_TIME')),
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fee_policy_club ON fee_policy (club_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_policy ENABLE ROW LEVEL SECURITY;

-- fee_bill : 회원 1명 × 1회차 청구서
CREATE TABLE fee_bill (
    id                 BIGSERIAL PRIMARY KEY,
    club_id            BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- 발행 시점 회원 스냅샷
    fee_policy_id      BIGINT NOT NULL REFERENCES fee_policy(id) ON DELETE RESTRICT,
    amount             BIGINT NOT NULL CHECK (amount >= 0),     -- 정책 금액 스냅샷
    billing_period     VARCHAR(30) NOT NULL,                    -- 표시 라벨: "2026-07","2026-1학기","2026","MT참가비"
    billing_start_date DATE NOT NULL,
    billing_end_date   DATE NOT NULL,
    due_date           DATE NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','PAID','PARTIAL_PAID','OVERDUE','CANCELLED')),
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_fee_bill_period_range CHECK (billing_end_date >= billing_start_date),
    CONSTRAINT chk_fee_bill_due_in_range  CHECK (due_date >= billing_start_date)
);
-- 멱등 핵심: 같은 정책·회원·회차(시작일)는 1건만, 단 취소건은 제외하여 재발행 허용
CREATE UNIQUE INDEX uk_fee_bill_idem
    ON fee_bill (fee_policy_id, user_id, billing_start_date)
    WHERE deleted_at IS NULL AND status <> 'CANCELLED';
CREATE INDEX idx_fee_bill_club_status ON fee_bill (club_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_fee_bill_user ON fee_bill (user_id) WHERE deleted_at IS NULL;
ALTER TABLE fee_bill ENABLE ROW LEVEL SECURITY;
```

설계 노트:
- `status`는 5값을 미리 `CHECK`에 넣지만 Sprint 1에서 실제 사용하는 전이는 `PENDING`(발행)·`CANCELLED`(취소)뿐이다. `PAID`/`PARTIAL_PAID`/`OVERDUE`는 Sprint 2 payment·크론에서 채운다.
- `due_date`는 청구 기간과 별개다. 학기 회비는 기간이 6개월이라도 마감일은 보통 학기 초다. `chk_fee_bill_due_in_range`로 `due_date < billing_start_date`(기간 시작 전 마감)를 DB에서 차단한다.
- `uk_fee_bill_idem`(부분 유니크 인덱스)이 동시 발행 멱등성의 **1차 메커니즘**이다. 발행 SQL의 `ON CONFLICT` 절은 이 부분 인덱스 술어(`WHERE deleted_at IS NULL AND status <> 'CANCELLED'`)를 그대로 명시해야 인덱스가 매칭된다(생략하면 Postgres가 "no unique or exclusion constraint matching" 에러; §7 참조).
- 기존 `Club.membershipFee`(free-form `String(100)`)는 본 설계에서 건드리지 않는다. 향후 "대표 회비 표시"로 남기거나 정책 요약으로 대체할 수 있으나 Sprint 1 범위 밖이다.

## 5. billing_type별 기간·마감 산출 규칙

발행 요청은 `billing_type`에 따라 입력이 다르다. 서버는 아래 규칙으로 `billing_period`(라벨)·`billing_start_date`·`billing_end_date`·`due_date`를 확정한다. 모든 날짜 계산은 주입된 `Clock`(`Asia/Seoul`) 기준이다(§2.10, 테스트 결정성).

| billing_type | 요청 입력 | 기간(start~end) | due_date | billing_period 라벨 |
|---|---|---|---|---|
| MONTHLY | `billingPeriod`="2026-07" | 해당 월 1일 ~ 말일 | 기본=청구월 말일 (요청 `dueDate`로 override 가능) | "2026-07" |
| SEMESTER | `billingStartDate`,`billingEndDate`,`dueDate`,`semesterLabel` | 입력값 | 입력값 | "2026-1학기" 등 입력 라벨 |
| YEARLY | `billingPeriod`="2026" (+옵션 `dueDate`) | 1/1 ~ 12/31 | 기본=**max(발행월 말일, 기간 시작일)**(과거·기간前 방지; override 가능) | "2026" |
| ONE_TIME | `name`(라벨), `billingStartDate`,`dueDate` | start=end=행사일 | 입력값 | 입력 라벨(예 "MT참가비") |

- MONTHLY 기본 마감일이 청구월 말일인 이유: 정책에 `due_day`가 없으므로 안전한 기본값을 쓰고, 필요 시 발행 시 `dueDate`로 덮어쓴다.
- **YEARLY 기본 마감일을 고정 `01/31`에서 `max(발행월 말일, 기간 시작일)`로 변경**: 연중(예 06-15)에 연회비를 발행하면 `01/31`은 이미 과거가 되어 "태어나자마자 연체"인 청구가 생긴다. 기본값으로 발행월 말일을 쓰되, 미래 연도를 선발행하는 경우(예 2026년에 `"2027"` 발행)에는 발행월 말일(2026-06-30)이 기간 시작(2027-01-01)보다 과거가 되어 §5.1-1·`chk_fee_bill_due_in_range`를 위반하므로 **기간 시작일로 clamp**한다(자동 기본값이 §5.1-1을 자기 위반하지 않도록). 다른 마감일이 필요하면 `dueDate`로 override한다.
- SEMESTER는 학교·운영마다 학기 경계가 다르므로 기간·마감을 항상 명시받는다. (예: 1학기 2026-03-01~2026-08-31, 마감 2026-03-31)
- 멱등 회차 식별자는 `billing_start_date`다. 따라서 같은 ONE_TIME 정책으로도 다른 행사일이면 별개 청구로 발행된다.

### 5.1 due_date 검증 (발행 시 확정 직후)

`due_date`를 확정한 직후 다음을 검증한다(모든 비교는 주입된 `Clock`[Asia/Seoul] 기준, `LocalDate.now()` 직접 호출 금지).

1. **정합성 — 전 타입**: `due_date >= billing_start_date`. 위반 시 `400 InvalidBillingPeriodException`(code=`DUE_DATE_BEFORE_PERIOD`). DB `chk_fee_bill_due_in_range`로 이중 방어한다.
2. **과거 마감 차단 — 운영자 override 한정**: 운영자가 `dueDate`를 **명시**했고 그 값이 발행일(오늘)보다 과거이면 `400 InvalidBillingPeriodException`(code=`DUE_DATE_IN_PAST`). `due_date == 오늘`은 허용(`isBefore`로 비교). **서버 자동 기본값에는 적용하지 않는다** — 시스템이 만든 기본값 때문에 사용자가 영문 모를 400을 맞는 것을 막기 위함이다(그래서 YEARLY 기본값을 위에서 미래로 고정했다).
3. **ONE_TIME 면제**: 이미 끝난 행사비를 사후 기록하는 것은 정상 업무이므로 ONE_TIME은 2번(과거 차단)에서 면제한다(1번 정합성은 적용). 운영자가 과거 행사일·과거 마감일을 의도적으로 넣을 수 있다.

> 시스템은 마감일을 자동 보정하지 않는다. 정합성에 어긋나거나(1) 운영자가 명백히 과거 마감을 명시하면(2) 거부하고, 운영자가 올바른 값을 입력하게 한다.

## 6. API 엔드포인트

경로 prefix는 기존 컨벤션을 따른다(`/api/v1`). 관리 API는 `leader/clubs/{clubId}/...`, 회원 API는 `my/...`. HTTP 상태는 프로젝트 규칙(POST 201, GET 200, PATCH/DELETE 204)을 따른다.

### 회비 정책 — `LeaderFeePolicyController` (`LeaderFeePolicyApi` 인터페이스)
- `POST   /api/v1/leader/clubs/{clubId}/fee-policies` → 201, 생성된 id
- `GET    /api/v1/leader/clubs/{clubId}/fee-policies` → 200, 목록
- `PATCH  /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}` → 204 (`name`·`amount`·`active`만 수정; `billing_type`은 발행 이력 있으면 변경 불가 → 409 `FeePolicyBillingTypeImmutableException`)
- `DELETE /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}` → 204 (soft delete; 발행 이력 있으면 거부하고 `active=false` 유도)

### 회비 청구 — `LeaderFeeBillController` (`LeaderFeeBillApi`)
- `POST   /api/v1/leader/clubs/{clubId}/fee-policies/{policyId}/bills` → 201
  - 요청 body는 **단일 `GenerateBillsRequest`**(타입별 필드 optional). `billing_type`은 경로의 `policyId`가 확정하므로 body에 type discriminator를 두지 않고, 서버가 정책 로드 후 5절·5.1절 규칙으로 조건 검증한다(§7).
  - 응답: `{ "created": <int>, "skipped": <int> }`. **동시 발행 시 best-effort** — `created`는 이 호출이 실제로 INSERT한 건수, `skipped`는 `대상 회원 수 − created`다. 다른 호출이 경쟁에서 이기면 `created=0`이어도 청구는 존재할 수 있으므로, 클라이언트는 응답값만 믿지 말고 목록을 재조회한다(§9).
- `GET    /api/v1/leader/clubs/{clubId}/fee-bills` → 200
  - query: `billingPeriod`, `status`, `userId`, 페이지네이션(`page`,`size`)
- `DELETE /api/v1/leader/clubs/{clubId}/fee-bills/{billId}` → 204 (개별 취소: `CANCELLED` 전이)

### 회원 본인 — `MyFeeController` (`MyFeeApi`)
- `GET    /api/v1/my/fees` → 200
  - query: 옵션 `clubId`, `status`. `@AuthenticationPrincipal`의 `currentUser.id()` 본인 것만.

## 7. 도메인 서비스 로직

백엔드 도메인 패키지: `com.duing.domain.fee/{api,controller,service,repository,entity,exception}`. 두 애그리거트(`FeePolicy`, `FeeBill`)와 각 컨트롤러/서비스/리포지토리를 둔다. 엔티티는 `BaseEntity` 상속, `@Builder(access=PRIVATE)` + static `create(...)` 팩토리, 모든 연관관계 `LAZY`, soft delete(`@SQLDelete`/`@SQLRestriction`). 서비스는 인터페이스 + `General{Domain}Service` 구현, `@Transactional(readOnly=true)` 기본·쓰기 메서드만 오버라이드.

### FeePolicyService
- `create(CreateFeePolicyCommand)` → `Long`: `requireManager` 후 정책 저장
- `update(UpdateFeePolicyCommand)` → `void`: `name`·`amount`·`active`만 반영. `billing_type`이 **실제로 달라지는** 요청에서 발행 이력이 있으면 `FeePolicyBillingTypeImmutableException`(409) — 동일값 PATCH는 통과. `amount`는 스냅샷(§2.5)이라 기존 청구액에 영향 없음.
- `getPolicies(clubId)` → 목록 Query
- `delete(clubId, policyId)` → `void`: 발행 이력 존재 시 `DeleteForbidden`, 아니면 soft delete

> **발행 이력 존재 검사(공유)**: `update`의 불변성 검사와 `delete`의 `DeleteForbidden`은 **동일한** `feeBillRepository.existsByFeePolicyId(policyId)`를 쓴다. 이 검사는 **취소(`CANCELLED`)·soft-delete 행까지 모두 포함**해야 하므로(이미 발행된 적이 있다는 사실 자체가 기준), `@SQLRestriction`을 우회하는 네이티브/전용 쿼리로 `deleted_at`·`status` 무관하게 카운트한다(= `uk_fee_bill_idem`의 역).

### FeeBillService — 핵심: `generateBills`
`generateBills(GenerateBillsCommand)` → `GenerateBillsResult(created, skipped)`:
1. `clubAuthService.requireManager(actorId, clubId)`
2. 정책 행을 **비관적 잠금**(`@Lock(PESSIMISTIC_WRITE)`, `findByIdForUpdate`)으로 조회 → `club_id` 일치·`active=true` 검증 (`Inactive` 시 409). 잠금으로 발행 도중 정책 비활성화·삭제(§7 `update`/`delete`)와의 경합을 직렬화한다.
3. **단일 flat `GenerateBillsRequest`**를 정책 `billing_type`에 맞춰 조건 검증하고, 5절 규칙으로 `billing_period`·`start`·`end`·`due_date`를 확정한 뒤 5.1절 due_date 검증을 통과시킨다 (`InvalidBillingPeriodException` 시 400). 다형성/`@JsonTypeInfo` 역직렬화는 정책 로드 **전**에 일어나 정책과 대조가 불가능하고 한국어 `@Valid` 메시지를 우회하므로 쓰지 않는다.
4. **단일 원자적 발행 SQL** — 활성 회원을 앱으로 읽어 `saveAll`하지 않고 아래 한 문장으로 발행한다(대상 선별과 삽입이 한 statement → 멤버 집합 TOCTOU 없음):

   ```sql
   INSERT INTO fee_bill
     (club_id, user_id, fee_policy_id, amount, billing_period,
      billing_start_date, billing_end_date, due_date, status)
   SELECT :clubId, cm.user_id, :policyId, :amount, :billingPeriod,
          :startDate, :endDate, :dueDate, 'PENDING'
   FROM club_member cm
   WHERE cm.club_id = :clubId AND cm.deleted_at IS NULL
   ORDER BY cm.user_id                                   -- 동시 INSERT 락 순서 고정(데드락 방지)
   ON CONFLICT (fee_policy_id, user_id, billing_start_date)
     WHERE deleted_at IS NULL AND status <> 'CANCELLED'  -- 부분 인덱스 술어 명시(없으면 매칭 실패)
   DO NOTHING
   ```
   - `created_at`/`updated_at`은 컬럼 DEFAULT `now()`에 맡긴다. `amount`는 정책 금액 스냅샷, `status='PENDING'`.
   - 역할 필터 없음 — 활성 회원 전원(MEMBER·OFFICER·LEADER)이 대상(§3, `ClubMember where club_id=:clubId and deleted_at IS NULL`).
   - 새 `@Modifying(clearAutomatically = true) @Query(nativeQuery = true) int bulkInsertBills(...)` 리포지토리 메서드로 구현(코드베이스에 네이티브 INSERT 전례 없음 → 신규 추가). `saveAll`은 충돌 시 트랜잭션 전체가 롤백(rollback-only)되어 부적합.
5. `created` = 4의 반환 건수(실제 INSERT된 행 수). `skipped` = `max(0, count(활성 회원) − created)`(동일 트랜잭션 내 cheap COUNT; 동시 멤버 soft-delete로 COUNT가 줄어 음수가 되는 일을 0으로 클램프). 반환 `{ created, skipped }`. 동시 호출 시 두 값은 호출별 best-effort이며(§6), 동시 호출들의 `created` 합이 실제 신규 건수와 일치한다.
6. 동시 발행 멱등성은 `uk_fee_bill_idem` 부분 유니크 인덱스가 보장한다(이것이 **1차 메커니즘**이다 — 기존의 "최종 방어선" 개념을 폐기한다). 충돌은 DB 레벨에서 무음 처리되므로 generateBills에는 `DataIntegrityViolationException`(SQLState 23505) → 도메인 예외 변환을 두지 않는다(코드베이스의 catch-and-translate 패턴에서 **의도적으로** 벗어난다).
7. **감사 로그**: 발행 완료 시 구조화 INFO 로그(`actorId`·`clubId`·`policyId`·`billingPeriod`·`created`·`skipped`)를 남긴다 — 무음 멱등으로 사라진 "몇 건 skip됐는가" 신호를 보완하고, 머니 기능의 감사 추적을 제공한다(Sprint 1 범위; 단순 로깅, `notification_log`(Sprint 2)와 무관).

기타:
- `cancelBill(clubId, billId)` → `void`: `requireManager` 후, 발행(generate)과 직렬화하기 위해 같은 `fee_policy` 행을 비관적 잠금(`findByIdAndClubIdForUpdate`)한 뒤 `status='CANCELLED'` 전이(이미 `CANCELLED`면 멱등 no-op). 취소-재발행 동시 경합을 방어하며 정책-우선 락 순서로 데드락이 없다. 감사 로그(`actorId`·`billId`·이전 상태) 기록.
- `getBills(clubId, BillSearchQuery, pageable)`: QueryDSL `BooleanExpression` 동적 필터(`billingPeriod`/`status`/`userId`)
- `getMyFees(userId, MyFeeSearchQuery)`: `user_id` 기준, 옵션 `clubId`/`status` 필터

DTO 2계층: `controller/dto/{request,response}`(HTTP 경계, `@Valid`/한국어 메시지) + `service/dto/{command,query}`(서비스 경계). 변환: Request→`toCommand()`, Query→`Response.from()`. 발행 요청은 **단일 flat `GenerateBillsRequest`**(타입별 필드 optional, body discriminator 없음)이며, `@Valid`는 타입 무관 형식 검증만 담당하고 타입별 필수/금지 필드 검증은 정책 로드 후 서비스(`generateBills` 3단계)에서 수행한다.

## 8. 권한 · 예외

- 관리 컨트롤러: 클래스 `@PreAuthorize("isAuthenticated()")`, 서비스 진입부에서 `clubAuthService.requireManager(actorId, clubId)`(LEADER·OFFICER 허용). LEADER 전용 작업 없음.
- `/my/fees`: `@PreAuthorize("isAuthenticated()")` + `currentUser.id()`로 본인 데이터 한정.
- 예외(`ApplicationException` 상속, `{Domain}Exception` 부모 + static final inner):
  - `FeePolicyException`: `FeePolicyNotFoundException`(404), `InactiveFeePolicyException`(409), `FeePolicyDeleteForbiddenException`(409, 발행 이력 존재), `FeePolicyBillingTypeImmutableException`(409, 발행 이력 있는 정책의 `billing_type` 변경)
  - `FeeBillException`: `FeeBillNotFoundException`(404), `InvalidBillingPeriodException`(400).
  - inner 예외 클래스명은 코드베이스 컨벤션인 풀네임 `{Predicate}{Domain}Exception`을 따른다(예: `ClubNotFoundException`).
  - **cross-club 접근**(경로 `clubId`와 다른 동아리의 정책·청구 id)은 별도 `ClubMismatch` 예외를 두지 않고 `findByIdAndClubId`(존재하지 않음) → `NotFound`(404)로 처리한다(코드베이스에 `ClubMismatch`가 없는 기존 컨벤션; 404가 리소스 존재를 노출하지 않아 보안상 유리). 해당 동아리의 매니저가 아닌 경우는 `requireManager`의 403이 먼저 걸린다. 마감일 검증 실패도 `InvalidBillingPeriodException`로 통일하되 `ApplicationException`의 `code`로 구분한다: `DUE_DATE_BEFORE_PERIOD`(§5.1-1), `DUE_DATE_IN_PAST`(§5.1-2). 별도 `InvalidDueDate` 예외는 만들지 않는다(같은 400 상태를 쪼개 택소노미를 분산시키지 않음; 프론트 분기는 `code`로).
- `generateBills`는 동시 충돌을 DB `ON CONFLICT`로 무음 흡수하므로, 기존 도메인들의 `catch DataIntegrityViolationException(23505) → 도메인 예외` 패턴을 **적용하지 않는다**(의도된 예외, §7-6).
- 권한 실패는 `ClubAuthService`의 `AccessDeniedException`(403)으로 일관 처리(전역 핸들러).

## 9. 프론트엔드

위치(기존 영역 재사용): `/admin`=글로벌 ADMIN, **`/manage`=클럽 회장·총무**, `/me`=회원.

### 총무 관리 — `/manage/clubs/[clubId]/fees` (2탭)
- 서버 컴포넌트 `page.tsx` → 클라이언트 `_pages/ClubFeesPage.tsx`(탭) → `_containers/` → `_components/` + `_lib/`
- **[정책] 탭**: 정책 목록(테이블/카드) + "정책 추가" 다이얼로그(`name`·`amount`·`billing_type`) + 수정·활성 토글. 수정 다이얼로그에서 **`billing_type`은 읽기 전용**으로 둔다 — `FeePolicyResponse`에 발행 이력 플래그가 없어 클라이언트가 발행 여부를 판단할 수 없고 유형 변경은 드문 케이스이므로 UI는 보수적으로 잠근다(API는 무이력 시 변경을 허용하나 UI에 노출하지 않으며, 유형을 바꾸려면 새 정책 생성을 유도). `amount` 옆에 "기존 발행 청구액은 바뀌지 않습니다" 안내. 삭제는 시도 후 `DeleteForbidden`(409) 시 "이미 청구 이력이 있는 정책은 삭제할 수 없습니다" 토스트로 reactively 처리하고 비활성화를 유도한다.
- **[청구] 탭**: "청구 발행" 다이얼로그(정책 선택 → MONTHLY는 회차만, SEMESTER/YEARLY/ONE_TIME은 기간·마감·라벨 입력) + 청구 현황 테이블(회차·상태·회원 필터, 행별 취소). 발행 결과 토스트는 "발행 완료(신규 N · 기존 M)"로 표기하고, mutation 성공 후 청구 목록을 **무조건 refetch**한다(동시 발행으로 `created=0`이어도 목록을 갱신).

### 회원 — `/me/fees`
- 본인 청구 목록(동아리별 그룹), 상태 뱃지(`PENDING`=납부대기 등), 금액 원 포맷

### 공통 배선 (pnpm workspaces)
- `packages/types/src/fee.ts`: `FeePolicy`, `FeeBill`, `BillingType`, `FeeStatus`, 검색 파라미터/`PageResponse` 타입 (`export type`, no `any`)
- `packages/api/src/client.ts`: `leader.fees.*`(정책/청구/발행/취소/현황) + `my.fees.list()` 네임스페이스 추가
- `packages/hooks/src/fee.ts` + `feeQueryKeys.ts`: `useClubFeePoliciesQuery`, `useGenerateBillsMutation`, `useClubFeeBillsQuery`, `useCancelBillMutation`, `useMyFeesQuery` 등 + 무효화 로직
- `packages/schemas`: 정책 생성/수정 Zod + 청구 발행 입력은 **선택된 정책의 `billing_type` 기준 폼 레벨 `z.discriminatedUnion`** → 제출 시 `.transform()`으로 단일 flat 요청(`GenerateBillsRequest`, 백엔드 DTO와 동일 명칭)으로 매핑. 와이어에는 discriminator를 보내지 않는다(백엔드 단일 DTO와 정합; `packages/types`는 flat 요청 타입만 export).
- UI: shadcn/ui 컴포넌트 + `cn()`, 라우팅은 `toRoute()`/`toLinkRoute()`

## 10. 테스트 전략

### 백엔드 (RestAssured + TestContainers(실 Postgres), `@DisplayName`은 요구사항 문장)
회원 픽스처는 기존 패턴(수동 빌더 + `AtomicLong` 시퀀스, `repository.save`)을 따른다(Fixture Monkey는 의존성에 있으나 미사용).

- 청구 발행 멱등성: 두 번 호출 시 `created`/`skipped`가 정확하다
- **동시성**: 같은 정책·회차·club에 10 스레드 동시 발행(활성 회원 100명) → `fee_bill` 정확히 100건. `IntegrationTestBase` extend(테스트 메서드 `@Transactional` **금지** — per-request TX라야 실제 동시성 재현), `CyclicBarrier`로 동시 진입 강제, `ExecutorService` 종료(`awaitTermination`)·`Future.get`으로 silent 실패 표면화. 단언 ① 행 수 100 ② 응답 `created` 합 100 · `skipped` 합 900 ③ `distinct user_id` 100 ④ 모든 응답 2xx(409 0건 — DB 멱등 vs catch-409 구현 회귀를 잡음).
- **동시성 엣지**: 활성 0명 club 발행 → 201 `created=0`·`skipped=0`. `CANCELLED` 1건 후 동시 재발행 10회 → 활성 1건만 생성(2건 금지).
- 활성 회원만 청구된다(soft-deleted 멤버 제외)
- 금액 스냅샷: 정책 금액을 바꿔도 기존 청구액은 불변이다. **추가**: 금액 변경 후 다음 회차 발행은 **새 금액**을 쓴다.
- billing_type별 기간·마감 산출: MONTHLY 자동(청구월 말일), SEMESTER/YEARLY/ONE_TIME 명시값, `dueDate` override
- **due_date 검증**: YEARLY를 연중(예 06-15)에 발행해도 기본 마감일이 과거가 아니다. `due_date < billing_start_date`는 400(`DUE_DATE_BEFORE_PERIOD`, DB CHECK로도 차단). 운영자 override가 발행일 이전이면 400(`DUE_DATE_IN_PAST`)이고 `== 오늘`은 통과. ONE_TIME 과거 행사 기록은 허용된다. (날짜는 고정 `Clock`로 결정적으로 검증)
- 취소: `CANCELLED` 전이 후 같은 회원·회차 재발행이 가능하다
- **billing_type 불변**: 발행 후(취소·soft-delete 포함) `billing_type` 변경 시 409 `FeePolicyBillingTypeImmutableException`(동일값 PATCH는 통과)
- 권한: 일반 MEMBER가 발행/조회 시 403, `/my/fees`는 본인 것만 반환된다
- 비활성 정책으로 청구 시 409, 발행 이력 있는 정책 삭제 시 409
- 잘못된 `billing_type`/회차 입력 시 400

> **선결 작업(모든 fee HTTP 테스트 공통)**: `IntegrationTestBase`의 `TRUNCATE ... CASCADE` 테이블 목록에 `fee_bill`·`fee_policy`를 추가한다(단일 CASCADE 문이라 순서 무관; 누락 시 모든 fee HTTP 테스트가 행을 누수하거나 FK로 깨짐). fee 테이블도 RLS 활성(정책 없음)이므로 TestContainers 데이터소스가 owner 역할로 접속하는지 확인한다(V59 이후 기존 RLS 테이블 테스트가 통과 중이므로 이미 충족일 가능성이 높음).

### 프론트 (Vitest + React Testing Library, 기존 `test/` 패턴)
- `_lib` 단위: 상태 뱃지 라벨, 금액 원 포맷, billing_type 라벨/입력 분기
- 발행 다이얼로그 입력 검증(Zod), 빈 상태, 권한/탭 노출

## 11. 빌드 순서 (1PR = 1단위)

백엔드 API 단위로 먼저 머지한 뒤 프론트 페이지 단위 PR을 올린다. 모든 브랜치는 `develop`에서 분기·`develop`으로 PR.

0. `chore(test)`: 공유 테스트 인프라 — `IntegrationTestBase` TRUNCATE 목록에 `fee_bill`·`fee_policy` 추가, RLS owner 접속 확인(§10 선결). 이후 모든 fee 테스트의 전제.
1. `feat(backend)`: V60 마이그레이션(부분 유니크 인덱스 + `chk_fee_bill_due_in_range` 포함) + `fee` 도메인 엔티티/리포지토리 골격. **`feeBillRepository.existsByFeePolicyId`를 골격에 포함**한다(PR2의 불변성 검사가 PR3에 역의존하지 않도록).
2. `feat(backend)`: 회비 정책 CRUD API — `billing_type` 불변성(409) 포함 (+테스트)
3. `feat(backend)`: 회비 청구 발행·취소 API (단일 `INSERT...ON CONFLICT` 멱등 로직 + 동시성 테스트, +테스트). **발행 요청 contract(단일 flat `GenerateBillsRequest`)를 여기서 동결**한다.
4. `feat(backend)`: 청구 현황 조회 API + `/my/fees` (+테스트)
5. `feat(frontend)`: `packages` 배선(types/api/hooks/schemas) — 폼 union → flat 요청 매핑(§9), BE-3 동결 contract 그대로 소비
6. `feat(frontend)`: `/manage/clubs/[clubId]/fees` 정책 탭
7. `feat(frontend)`: 청구 탭(발행·현황·취소)
8. `feat(frontend)`: `/me/fees`

## 12. 이후 스프린트 / v2 매핑 (참고)

본 설계는 v2 개선안의 다음 항목을 의도적으로 이후로 미뤘다. 스키마는 이를 막지 않도록 잡았다(상태값 5종 선반영, 금액 스냅샷, 청구 기간 컬럼).

- **Sprint 2**: `payment`(bill_id·amount·payment_method·match_type·paid_at) 테이블, 수동 납부 체크 → `PAID`/`PARTIAL_PAID` 전이, 미납 연체 크론(`PENDING`→`OVERDUE`), 알림(인앱 `Notification`/이메일 Resend 재사용) + `notification_log`, 집계 대시보드
- **Sprint 3**: `bank_account`, `member_payment_code`, `bank_transaction`(`raw_payload jsonb` 포함), BANK API 폴링 배치, 1~4차 자동매칭(입금코드 → 회원명+금액 → 회원명+최근미납 → 검토 큐)
- **Sprint 4**: 관리자 검토 큐(`review_status`/`reviewed_by`/`reviewed_at`/`review_note`), 자동 영수증, 운영 안정화
- **운영 원칙**: 목표는 "100% 자동 매칭"이 아니라 "총무 업무 최소화" — 자동매칭 실패 시에도 후보 추천 + 원클릭 승인 UX를 지향한다.
- **향후 확장**: 출석 연동 할인, 포인트 차감, 행사 참가비, 회계 장부, 예산, 가상계좌/자동이체/카드결제, AI 총무 리포트
