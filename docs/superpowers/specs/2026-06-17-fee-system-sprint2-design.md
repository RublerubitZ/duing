# 회비 관리 시스템 — Sprint 2 설계서

- 작성일: 2026-06-17
- 대상: Du-ing(두잉) 모노레포 (backend: Spring Boot 3.4 / Java 21, frontend: Next.js 15 / React 19)
- 범위: 회비 관리 시스템 **Sprint 2** (납부 처리 · 연체 자동화 · 인앱 알림 · 집계 대시보드)
- 전제: Sprint 1(회비 정책·청구·조회)과 회비 계좌(AES-256-GCM 암호화)는 `develop`에 머지되어 있다. 본 설계는 그 위에 얹는다. Sprint 3(BANK API 자동매칭)·자동 월 발행 크론·영수증은 범위 밖이다.

---

## 1. 배경과 목표

Sprint 1은 "청구를 만들고 누가 무엇을 청구받았는지 보는" 단계까지 닫았다. Sprint 2는 **납부 사이클을 끝까지 닫는다**:

- 총무가 청구별로 **납부를 기록**한다(전액·부분, 납부 수단 포함). 정정은 삭제가 아니라 **취소(VOID)로 이력을 보존**한다.
- 마감을 넘긴 미납·부분납부 청구는 **자동으로 연체(OVERDUE)** 처리된다(일 1회 크론).
- 회원은 **인앱 알림**으로 청구·연체·납부 확인을 받는다(이메일 없음).
- 총무는 **집계 대시보드**로 수납률·미수금을 본다.

Sprint 2 성공 기준: 총무가 납부를 기록/정정하면 청구 상태와 수납률이 즉시 반영되고, 연체가 자동 처리되며, 회원이 본인 회비 화면과 알림으로 진행 상황을 확인할 수 있다.

## 2. 핵심 설계 결정 (확정)

1. **다중 납부 기록**: `fee_bill` 하나에 `payment` 행이 여러 개 쌓인다(분할 입금). bill 상태는 **활성 납부 합계 + 마감일**로 자동 산출한다(별도 금액 컬럼 비저장 — 합계는 읽을 때 계산, `status`만 비정규화 저장).
2. **상태 산출 규칙**(§5): `PAID`(합계 ≥ 청구액) · `PARTIAL_PAID`(0 < 합계 < 청구액 **& 마감 전**) · `OVERDUE`(완납 안 됨 **& 마감 경과**, 미납·부분 모두 포함) · `PENDING`(합계 = 0 & 마감 전) · `CANCELLED`(수동, Sprint 1). 즉 **OVERDUE = "완납 안 됨 + 마감 경과"**.
3. **납부 정정은 VOID(취소 이력 보존), 삭제 아님**: `payment`를 물리/소프트 삭제하지 않는다. `status='VOIDED'` + `voided_by`·`voided_at`·`void_reason`으로 표시하고 이력에 남긴다. 상태 재계산은 **`ACTIVE` 납부만** 합산한다. 회계 검증·운영진 분쟁 대비.
4. **초과입금 차단**: 납부 금액은 **남은 미납액 이하만** 허용한다. 활성 합계가 청구액을 넘지 않는다(환불·초과 회계 없음).
5. **날짜는 주입 `Clock`(Asia/Seoul) 기준**: 마감 판정·연체 크론 모두 주입 `Clock`을 쓴다(테스트 결정성, Sprint 1과 동일).
6. **동시성**: 납부 기록/취소 시 대상 `fee_bill` 행을 **비관적 잠금**해 상태 재계산을 직렬화한다. 연체 크론은 set-based **멱등 UPDATE**.
7. **인앱 알림만**: 기존 `notification` 도메인을 재사용한다. **이메일 없음**(이메일은 가입·비밀번호 재설정 전용). 별도 `notification_log` 테이블은 만들지 않는다(`Notification` 엔티티가 곧 이력).
8. **범위 제외**: 자동 월 발행 크론, BANK API 자동매칭(Sprint 3), 영수증, 회원 자가 납부 신고(총무 수동 기록만).

## 3. 스코프

### In Scope (Sprint 2)
- `payment` 테이블 + 납부 **기록**·**취소(VOID)**·**내역 조회** + bill 상태 자동 산출.
- 연체 자동화 크론(`PENDING`·`PARTIAL_PAID` → `OVERDUE`).
- 인앱 알림 4종(청구 발행 · 연체 · 부분 납부 확인 · 완납 확인) — 기존 Notification 재사용.
- 집계 대시보드(총 청구액·수납액·미수금·수납률·상태별 건수) — 총무 화면.
- 프론트: 청구 탭 납부 기록 다이얼로그·납부 내역(VOID)·상태 반영·진행률, 청구 탭 상단 요약 카드, `/me/fees` 진행률(읽기 전용). 알림은 기존 알림 피드/벨 재사용.

### Out of Scope
- 이메일 알림, `notification_log` 테이블 → 범위 외(이메일은 가입/비번재설정 전용).
- 자동 월 발행 크론 → 향후(Sprint 1의 "수동 트리거" 결정 유지).
- BANK API 거래 수집·자동매칭·검토 큐·영수증 → **Sprint 3~4**.
- 회원 자가 납부 신고, 환불/초과입금 회계, 부분 환불 → 범위 외.
- 알림 정리(취소/철회 시 기존 알림 삭제) → 범위 외. **알려진 한계**: 청구를 취소한 뒤 같은 회차를 재발행하면 취소된 청구의 옛 `FEE_BILL_ISSUED` 알림이 남는다(재발행은 새 청구 id를 만들어 멱등 인덱스를 우회하므로 새 알림이 별도 생성됨). 두 알림 모두 `/me/fees`로 링크되어 회원에게는 현재 회비가 정상 노출되므로 cosmetic 중복일 뿐 데이터 무결성 문제는 없다. 알림 소프트삭제/정리는 별도 기능으로 향후 검토.

## 4. 데이터 모델 (Flyway V62)

새 마이그레이션 1개로 `payment` 테이블을 만든다. 기존 마이그레이션 수정 금지, snake_case, `TIMESTAMP WITH TIME ZONE`, `BIGSERIAL`, `VARCHAR + CHECK`, FK `ON DELETE RESTRICT`, BaseEntity 표준 컬럼, 그리고 **`ENABLE ROW LEVEL SECURITY`**(V59 패턴). `fee_bill`에는 컬럼을 추가하지 않는다(상태는 기존 enum 재사용, 납부 합계는 응답에서 계산).

```sql
-- payment : fee_bill 1건에 대한 납부 기록(분할 입금 시 여러 행). 정정은 VOID 로 이력 보존.
CREATE TABLE payment (
    id            BIGSERIAL PRIMARY KEY,
    fee_bill_id   BIGINT NOT NULL REFERENCES fee_bill(id) ON DELETE RESTRICT,
    amount        BIGINT NOT NULL CHECK (amount > 0),                 -- 납부액(정수 원)
    method        VARCHAR(20) NOT NULL
                  CHECK (method IN ('CASH','TRANSFER','OTHER','AUTO_MATCHED')),  -- AUTO_MATCHED=Sprint 3 자동매칭 전용
    paid_at       TIMESTAMP WITH TIME ZONE NOT NULL,                  -- 납부 시각(UI 는 yyyy-MM-dd 표시)
    recorded_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- 기록한 총무
    memo          VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','VOIDED')),
    voided_by     BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    voided_at     TIMESTAMP WITH TIME ZONE,
    void_reason   VARCHAR(200),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_payment_bill ON payment (fee_bill_id) WHERE deleted_at IS NULL;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
```

설계 노트:
- **VOID는 `status`로 처리하고 삭제하지 않는다.** `payment`는 물리/소프트 삭제 대상이 아니다(정정은 VOID). `deleted_at`은 BaseEntity 표준 컬럼으로 남기지만 사용하지 않으며, `@SQLRestriction(deleted_at IS NULL)`은 항상 참이다. 상태 산출에 "활성"은 `status='ACTIVE'`로 판정한다.
- `paid_at`은 `timestamptz`(납부 시각). UI 는 `yyyy-MM-dd`로 표시하되, 같은 날 기록·정정·재기록이 섞여도 시각 단위로 추적 가능하다(이벤트 순서는 `created_at`/`voided_at`로도 보강).
- **`method='AUTO_MATCHED'`는 Sprint 3 BANK API 자동매칭이 생성하는 납부 전용**이다(동일 `payment` 엔티티 공유 → 자동/수동 구분). **총무 수동 기록 경로(API·UI·Zod)는 `CASH`/`TRANSFER`/`OTHER`만 허용**하고 `AUTO_MATCHED` 입력은 거부한다(400).
- **`paidAmount`는 캐시 없이 `ACTIVE` 납부 합계로 실시간 산출**한다(과설계 회피, 단일 진실원 = `payment` 행). 향후 데이터 규모가 커지면 `fee_bill.paid_amount` 캐시 컬럼을 도입할 수 있도록 열어 둔다(현재는 미도입).
- `fee_bill.status`(Sprint 1 enum)는 그대로 쓰고 본 스프린트에서 `PAID`/`PARTIAL_PAID`/`OVERDUE` 전이를 채운다.

## 5. bill 상태 산출 규칙 (재계산 로직)

납부 기록·취소·연체 크론 모두 **하나의 재계산 헬퍼**를 공유한다. 입력은 대상 `fee_bill` 1건.

1. `activePaid = Σ payment.amount (해당 bill, status='ACTIVE')`
2. 산출(모든 마감 비교는 주입 `Clock`[Asia/Seoul]의 오늘):

| 조건 | bill.status |
|---|---|
| `activePaid ≥ bill.amount` | `PAID` |
| `0 < activePaid < bill.amount` **& `due_date ≥ 오늘`** | `PARTIAL_PAID` |
| `0 < activePaid < bill.amount` **& `due_date < 오늘`** | `OVERDUE` |
| `activePaid = 0` & `due_date ≥ 오늘` | `PENDING` |
| `activePaid = 0` & `due_date < 오늘` | `OVERDUE` |

- `CANCELLED` 청구는 재계산 대상이 아니다. 취소된 청구에 납부 기록 시도는 `BillNotPayable`(409).
- 납부가 완납을 만들면 `OVERDUE`/`PARTIAL_PAID` → `PAID`로 올라간다. 완납 전 부분 납부가 마감을 지난 청구에 들어오면 `OVERDUE` 유지(여전히 미완납·마감 경과).

## 6. API 엔드포인트

경로 prefix `/api/v1`. 관리 API는 `leader/clubs/{clubId}/...`, HTTP 상태는 프로젝트 규칙(POST 201, GET 200, PATCH/DELETE/POST-action 204).

### 납부 — `LeaderPaymentController` (`LeaderPaymentApi`)
- `POST   /api/v1/leader/clubs/{clubId}/fee-bills/{billId}/payments` → 201, 생성된 payment id
  - body: `amount`·`method`(CASH/TRANSFER/OTHER)·`paidAt`·`memo`(선택). 기록 후 bill 상태 재계산.
- `GET    /api/v1/leader/clubs/{clubId}/fee-bills/{billId}/payments` → 200, 납부 내역(VOIDED 포함, 정정 이력 노출)
- `POST   /api/v1/leader/clubs/{clubId}/fee-bills/{billId}/payments/{paymentId}/void` → 204 (정정=취소)
  - body: `reason`(선택). `ACTIVE` 납부만 취소 가능, 이미 `VOIDED`면 멱등 no-op. 취소 후 bill 상태 재계산.

### 대시보드 — `LeaderFeeSummaryController` (`LeaderFeeSummaryApi`)
- `GET    /api/v1/leader/clubs/{clubId}/fee-bills/summary` → 200
  - query: 옵션 `billingPeriod`·`policyId`. 응답: 총 청구액·수납액·미수금·수납률·건수(전체/완납/부분/미납/연체).

### 청구 응답 보강 (기존 Sprint 1 엔드포인트)
- `GET /leader/clubs/{clubId}/fee-bills`·`GET /my/fees` 응답에 `paidAmount`(활성 납부 합계)·`remainingAmount`(청구액−납부) 필드를 추가한다(진행률 표시). 회원은 읽기 전용(납부 기록은 총무만).

## 7. 도메인 서비스 로직

백엔드 패키지: `com.duing.domain.fee/{...}`에 `payment` 관련을 추가한다. 엔티티는 `BaseEntity` 상속, `@Builder(access=PRIVATE)` + static `create(...)` 팩토리, 서비스는 인터페이스 + `General{Domain}Service`.

### PaymentService
- `record(RecordPaymentCommand)` → `Long`:
  1. `clubAuthService.requireManager(actorId, clubId)`
  2. 대상 `fee_bill`을 **비관적 잠금**(`findByIdAndClubIdForUpdate`)으로 조회(없으면 404, cross-club은 404)
  3. `status='CANCELLED'`이면 `BillNotPayable`(409)
  4. 남은 미납액(`amount − activePaid`) 계산 → 요청 `amount`가 이를 초과하면 `PaymentExceedsRemaining`(400)
  5. `payment` 저장(`status='ACTIVE'`, `recorded_by=actor`) → §5 헬퍼로 bill 상태 재계산·반영
  6. 상태가 `PAID`/`PARTIAL_PAID`로 올라가면 회원에게 **납부 확인 알림**(§ 알림)
- `void(clubId, actorId, billId, paymentId, reason)` → `void`: `requireManager` → bill 잠금 → payment(해당 bill, `ACTIVE`) 로드(없으면 404, 이미 VOIDED면 no-op) → `VOIDED` 전이(`voided_by/at`, `void_reason`) → bill 상태 재계산
- `getPayments(clubId, actorId, billId)`: `requireManager` 후 납부 내역(ACTIVE+VOIDED) 조회

### OverdueBillJob (연체 크론)
- 기존 `@EnableScheduling`/job-config 패턴 재사용. **매일 1회**(예 00:10 Asia/Seoul). 플래그 `duing.fee.overdue.enabled`(기본 true; 테스트 off).
- `status IN ('PENDING','PARTIAL_PAID') AND due_date < 오늘(Clock) AND deleted_at IS NULL` 인 bill을 set-based로 `OVERDUE`로 전이(멱등). `PAID`/`CANCELLED` 제외.
- **전이/알림 멱등성(구현)**: 후보를 `SELECT id, user_id, billing_period ... WHERE status IN ('PENDING','PARTIAL_PAID') AND due_date < :today AND deleted_at IS NULL FOR UPDATE` 로 **잠근 뒤**(동시 납부 기록의 bill 행 잠금과 직렬화) 그 id 들만 `UPDATE ... SET status='OVERDUE'` 로 일괄 전이하고, **잠긴 후보(=이번 실행 전이 대상)** 별로 연체 알림 이벤트를 발행한다. 이미 `OVERDUE`인 청구는 WHERE에서 제외되어 후보가 되지 않으므로 **알림이 재발송되지 않는다**(크론 재실행에도 중복 연체 알림 없음). 알림은 크론 트랜잭션 커밋 후(`@TransactionalEventListener(AFTER_COMMIT)`)에만 발송되어 전이가 롤백되면 알림도 없다. (FOR UPDATE 후보잠금 2단계는 `UPDATE ... RETURNING` 단일 쿼리와 기능 동치이며, 동시성 직렬화가 더 명확하다.)

### FeeBillSummaryService (대시보드)
- `getSummary(clubId, actorId, SummaryQuery)`: `requireManager` 후 QueryDSL 집계 — `fee_bill`(필터: club, 옵션 billingPeriod/policy, `deleted_at IS NULL`) 기준 총 청구액·건수, `payment`(ACTIVE) join 으로 수납액, 상태별 건수. 미수금=총−수납, 수납률=수납/총.

### 알림 (기존 notification 도메인 재사용)
`notification` 도메인의 타입 enum에 fee 알림 타입 4종을 추가한다: `FEE_BILL_ISSUED`·`FEE_BILL_OVERDUE`·`FEE_PARTIAL_PAYMENT_CONFIRMED`·`FEE_PAID_CONFIRMED`. 모두 인앱 전용, 링크 `/me/fees`.
- **청구 발행 시** (`FEE_BILL_ISSUED`): Sprint 1 `GeneralFeeBillService.generateBills`에 fan-out hook을 **추가**한다 — 청구받은 회원들에게 인앱 알림("○○ 동아리 회비(회차) 청구 · 마감 ○○"). 기존 알림 fan-out/브로드캐스트 패턴 재사용.
- **연체 시** (`FEE_BILL_OVERDUE`): `OverdueBillJob`이 이번 실행에서 전이된 청구의 회원에게만(위 멱등성).
- **납부 확인 시**: `record()`가 재계산 결과에 따라 — **완납이면 `FEE_PAID_CONFIRMED`**("회비 납부가 완료되었습니다"), **부분이면 `FEE_PARTIAL_PAYMENT_CONFIRMED`**("회비 일부 납부가 확인되었습니다 · 남은 금액 ○○").
- 알림 생성은 기존 `notification` 도메인의 생성 경로를 그대로 호출한다(구현 시 실제 API 확인). 별도 로그 테이블 없음.

## 8. 권한 · 예외

- 납부·대시보드 컨트롤러: 클래스 `@PreAuthorize("isAuthenticated()")`, 서비스 진입부 `clubAuthService.requireManager(actorId, clubId)`.
- 예외(`ApplicationException` 상속, 코드베이스 컨벤션대로 **풀네임 inner 클래스**):
  - `PaymentException`: `PaymentNotFoundException`(404), `PaymentExceedsRemainingException`(400, 초과입금), `BillNotPayableException`(409, 취소된 청구에 납부)
  - cross-club 접근(경로 `clubId`와 다른 동아리의 bill/payment)은 `findByIdAndClubId`로 `*NotFoundException`(404) 처리(Sprint 1 컨벤션, `ClubMismatch` 없음).
- 동시성: 납부 기록/취소는 `fee_bill` 행 비관적 잠금으로 상태 재계산을 직렬화. 연체 크론은 set-based 멱등 UPDATE라 잠금 불필요.

## 9. 프론트엔드

위치(기존 영역 재사용): **`/manage`=클럽 회장·총무**, `/me`=회원. Sprint 1의 회비 관리 화면(정책·청구·계좌 탭)과 `/me/fees`에 얹는다.

### 총무 관리 — `/manage/clubs/[clubId]/fees`
- **[청구] 탭 상단**: 대시보드 **요약 카드**(수납률·미수금·총 청구액·상태별 건수) — 회차 필터와 연동(별도 탭 아님). `useClubFeeSummaryQuery`.
- **[청구] 탭 테이블**: 각 행에 납부 진행(`paidAmount`/`remainingAmount` 진행률) + 상태 뱃지(PAID/PARTIAL/OVERDUE) + "납부 기록" 액션.
  - **납부 기록 다이얼로그**: 금액(기본=남은액)·수단 select(현금/계좌이체/기타)·납부일·메모. `useRecordPaymentMutation`. 성공 토스트 + 목록 invalidate.
  - **납부 내역**: 행별 payment 목록(금액·수단·납부일·기록자), `ACTIVE`는 "취소" 버튼(확인 다이얼로그 → `useVoidPaymentMutation`), `VOIDED`는 취소선/배지로 이력 표시.

### 회원 — `/me/fees`
- 청구별 상태 + 진행률(`paidAmount`/`remainingAmount`) **읽기 전용**. 알림은 기존 알림 피드/벨에 자동 노출(클릭 시 `/me/fees`).

### 공통 배선 (pnpm workspaces)
- `packages/types`: `Payment`·`PaymentMethod`·`FeeBillSummary`·보강된 `FeeBill`/`MyFee`(paidAmount·remainingAmount).
- `packages/api`: `leader.fees.payments.{record,list,void}` + `leader.fees.summary`.
- `packages/hooks`: `useBillPaymentsQuery`·`useRecordPaymentMutation`·`useVoidPaymentMutation`·`useClubFeeSummaryQuery` + 무효화.
- `packages/schemas`: 납부 기록 입력 Zod(금액·**수단 enum `{CASH,TRANSFER,OTHER}`**·납부일·메모) — `AUTO_MATCHED`는 수동 입력 불가.
- `_lib/feeLabels`: `paymentMethodLabel`(현금/계좌이체/기타/자동매칭) 추가 — 표시는 4종이나 납부 기록 폼 select 는 수동 3종만(`AUTO_MATCHED`는 Sprint 3 시스템 생성). 상태 라벨은 기존 재사용.

## 10. 테스트 전략

### 백엔드 (RestAssured + TestContainers(실 Postgres))
- 납부 기록 → 상태 산출: 부분→`PARTIAL_PAID`, 완납→`PAID`, 마감 지난 미납/부분→`OVERDUE`.
- 초과입금 차단(남은액 초과 → 400), 취소된 청구 납부(→ 409), **수동 기록에 `method=AUTO_MATCHED` → 400**(수동 경로 거부).
- VOID: 취소 후 합계·상태 재계산, **payment 행은 보존되고 `VOIDED` 표시**(내역 조회에 노출), 이미 VOIDED면 멱등.
- 동시성: 같은 bill에 동시 납부 기록 시 상태 재계산이 직렬화되어 합계·상태가 일관.
- 연체 크론: 마감 지난 PENDING/PARTIAL_PAID만 OVERDUE 전이, PAID/CANCELLED 제외, 멱등(재실행 무변), 고정 `Clock`로 결정적.
- 알림: 발행(`FEE_BILL_ISSUED`)·연체(`FEE_BILL_OVERDUE`)·납부확인(완납 `FEE_PAID_CONFIRMED` / 부분 `FEE_PARTIAL_PAYMENT_CONFIRMED`) 생성. **연체 알림은 실제 전이된 청구만, 크론 재실행 시 중복 발송 없음**.
- 대시보드 집계: 수납액=ACTIVE payment 합계, 미수금·수납률·상태별 건수 정확.
- 권한: 비총무 403, cross-club 404. `IntegrationTestBase` TRUNCATE에 `payment` 추가(자식→부모 순).

### 프론트 (Vitest + RTL)
- 납부 다이얼로그 입력 검증(Zod, 남은액 초과·수단 누락), 상태 뱃지·진행률, VOID 표시(취소선/배지), 대시보드 카드 수치, 빈/로딩 상태.

## 11. 빌드 순서 (1PR = 1단위)

모든 브랜치는 현재 `feat/fee-system-sprint2`(또는 `develop`)에서 분기, 백엔드 먼저 머지 후 프론트.

0. `chore(test)`: 공유 테스트 인프라 — `IntegrationTestBase` TRUNCATE에 `payment` 추가.
1. `feat(backend)`: V62 `payment` 마이그레이션 + 엔티티/리포지토리 + **상태 재계산 헬퍼**(공유).
2. `feat(backend)`: 납부 기록·취소(VOID)·내역 API + bill 응답 보강(`paidAmount`/`remaining`).
3. `feat(backend)`: 연체 크론(`OverdueBillJob`) + 인앱 알림(발행·연체·납부확인) — notification 도메인 재사용, Sprint 1 `generateBills`에 발행 알림 hook 추가.
4. `feat(backend)`: 대시보드 집계 API(`summary`).
5. `feat(frontend)`: packages 배선(types/api/hooks/schemas) + 납부 수단 라벨.
6. `feat(frontend)`: 청구 탭 납부 기록·내역(VOID)·상태/진행률.
7. `feat(frontend)`: 청구 탭 상단 대시보드 요약 카드.

## 12. 이후 스프린트 (참고)

- **Sprint 3**: `bank_account`·`member_payment_code`·`bank_transaction`(raw jsonb), BANK API 폴링·1~4차 자동매칭(입금코드→회원명+금액→회원명+최근미납→검토 큐), 자동 월 발행 크론, 영수증.
- **운영 원칙**: "100% 자동 매칭"이 아니라 "총무 업무 최소화" — 자동매칭 실패 시 후보 추천 + 원클릭 승인 UX 지향(Sprint 1 설계서 계승).
