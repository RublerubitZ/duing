# 회비 관리 시스템 Sprint 4 — 영수증 · 자동 월발행 크론 설계서

작성일 2026-06-18 · 선행: [Sprint 1](2026-06-16-fee-system-sprint1-design.md) · [Sprint 2](2026-06-17-fee-system-sprint2-design.md) · [Sprint 3](2026-06-17-fee-system-sprint3-design.md)

## 1. 배경 / 목표

Sprint 1~3(청구·납부·연체·알림·대시보드·BANK 자동매칭) 위에, 이전 스프린트에서 Out of Scope 로 미뤘던 두 가지를 추가한다.

1. **영수증** — 회원이 납부한 회비의 영수증을 화면에서 확인하고 인쇄/PDF로 보관.
2. **자동 월발행 크론** — MONTHLY 정책에 한해 매월 청구를 자동 발행(총무 수동 발행의 부담 제거).

두 기능은 **서로 독립적**이다(의존 없음). 설계서는 하나로 묶되 구현 PR/계획은 둘로 나눈다.

## 2. 핵심 결정 (합의됨)

- **영수증 = 프론트 인쇄용**(서버 PDF 생성·저장 안 함). 백엔드는 영수증 데이터만 주고, 프론트가 인쇄 전용 화면 + `window.print()`로 PDF 저장. → PDF 라이브러리·파일 저장소·인터페이스 변경 불필요.
- **영수증 단위 = `fee_bill`**. ACTIVE 납부가 1건 이상인 청구에만 발급.
- **영수증 번호 = `RCP-{YYYYMM}-{billId}`** (예: `RCP-202607-12345`). `YYYYMM`은 항상 값이 있는 `billing_start_date`에서 도출(MONTHLY 외 타입도 안전). 청구 id 직접 노출보다 식별성 우선.
- **자동발행은 MONTHLY 정책 한정 opt-in**. 정책에 `auto_issue` + `issue_day`(발행일) + `due_day`(마감일) 추가.
- **크론 발행 조건 = `오늘 >= issue_day` (그 달 캐치업)**. `== issue_day` 가 아니다 — 서버가 발행일 하루 죽으면 그 달 발행이 영구 누락되므로, `>=` + **기존 ON CONFLICT 멱등 발행**(이미 발행이면 created=0·재발송 없음)으로 며칠 장애 뒤에도 그 달 안에서 자동으로 따라잡는다.
- **`due_day >= issue_day` 강제 검증**(둘 다 1~28). 마감일이 발행일보다 앞서는 역전(같은 달 안에서) 차단 — 단순·운영 실수 방지.
- 발행 알림은 기존 **`FEE_BILL_ISSUED`** 그대로(신규 알림 타입 없음). 영수증 관련 신규 알림도 없음.
- 신규 env `DUING_FEE_AUTO_ISSUE_ENABLED`(기본 false, Sprint 3 연체 크론 `DUING_FEE_OVERDUE_ENABLED`와 동일 패턴).

## 3. 스코프

### In Scope
- **영수증**: 회원·총무 영수증 데이터 API + 프론트 인쇄용 영수증 페이지.
- **자동발행**: `fee_policy` opt-in 컬럼(V65) + 검증 + 일 1회 크론(`MonthlyBillIssueJob`) + 크론 전용 발행 경로(권한 우회·발행 알림 재사용).
- 총무 정책 폼에 자동발행 토글·발행일·마감일 입력.

### Out of Scope
- 서버 PDF 생성·저장·이메일 영수증 → 향후(필요 시 프론트 인쇄용 위에 추가).
- 영수증 일련번호의 전역 시퀀스/위변조 방지(공식 세금계산서급) → 범위 외. `RCP-{YYYYMM}-{billId}`는 조회·식별용.
- MONTHLY 외 타입(SEMESTER/YEARLY/ONE_TIME) 자동발행 → 범위 외(비반복성).
- 발행일이 달을 넘겨 누락되는 극단적 장기 장애(예: 발행일~다음달까지 연속 다운) 자동 보정 → 범위 외(그 달 캐치업까지만; 그 외는 총무 수동 발행).

---

## ① 영수증

### 4. 데이터 (신규 테이블 없음)
영수증은 기존 `fee_bill` + 그 청구의 ACTIVE `payment` + `club`/`club_member`(회원명)·`fee_policy`(정책명)에서 조립한다. 저장하지 않는다(요청 시 조회·렌더).

### 5. ReceiptResponse
```text
ReceiptResponse(
  receiptNumber,   // "RCP-" + billing_start_date(yyyyMM) + "-" + billId
  clubName,
  memberName,
  policyName,      // fee_bill.fee_policy_id → fee_policy.name
  billingPeriod,   // 회차 라벨
  billingStartDate, billingEndDate, dueDate,
  amount,          // 청구액
  paidTotal,       // ACTIVE 납부 합계
  remaining,       // amount - paidTotal
  status,          // FeeStatus (완납/부분 등)
  issuedAt,        // 발급 시각(now)
  payments: [ { amount, method, paidAt, memo } ]   // ACTIVE 납부 내역(VOIDED 제외)
)
```

### 6. API
- `GET /api/v1/me/fees/{billId}/receipt` (회원 본인) → 200 `ApiResponse<ReceiptResponse>`. 본인 청구가 아니면 404(타인 청구 존재 비노출).
- `GET /api/v1/leader/clubs/{clubId}/fee-bills/{billId}/receipt` (총무 LEADER/OFFICER) → 200. `requireManager` + 청구가 그 동아리 소속(아니면 404).
- 두 경우 모두 **ACTIVE 납부가 0건이면 404**(`ReceiptUnavailableException`, "납부 내역이 없어 영수증을 발급할 수 없습니다."). CANCELLED 청구도 동일(납부 없음).

### 7. 도메인 서비스 (영수증)
`ReceiptService`(interface) + `GeneralReceiptService`: `ReceiptView getMemberReceipt(Long userId, Long billId)` / `ReceiptView getClubReceipt(Long clubId, Long actorId, Long billId)`.
- 청구 조회(본인/동아리 격리), ACTIVE 납부 목록(`PaymentRepository.findByFeeBillIdOrderByCreatedAtAsc` 중 ACTIVE만, 또는 전용 조회), 회원명/정책명/동아리명 조인.
- ACTIVE 납부 0건 → `ReceiptUnavailableException`(404).
- `receiptNumber` = `"RCP-" + billingStartDate.format("yyyyMM") + "-" + billId`.
- `paidTotal` = ACTIVE 납부 합계(`PaymentRepository.sumActiveByFeeBillId` 재사용), `remaining` = amount − paidTotal.

### 8. 프론트 (영수증)
- `packages/types`: `Receipt`(위 응답 1:1), `packages/api`: `my.feeReceipt(billId)` / `leader.fees.receipt(clubId, billId)`, `packages/hooks`: `useMyFeeReceiptQuery(billId)` / `useClubFeeReceiptQuery(clubId, billId)`.
- **영수증 화면**: `/me/fees`의 ACTIVE 납부 있는 청구에 **"영수증" 버튼** → 영수증 페이지/모달. 총무는 청구 목록(BillList) 또는 납부 내역(PaymentHistory)에서 **"영수증"** → 같은 컴포넌트.
- 영수증 컴포넌트: 동아리명·영수증번호·발급일 헤더, 회원·정책·회차·금액(청구/납부/잔액)·상태, 납부 내역 표, 하단 **"인쇄 / PDF 저장"** 버튼(`window.print()`). **인쇄 전용 CSS**(`@media print`)로 버튼·네비 숨기고 영수증만 출력. 회원은 본인 것, 총무는 동아리 회원 것.

---

## ② 자동 월발행 크론

### 9. 데이터 모델 (Flyway V65)
기존 마이그레이션 수정 금지. `fee_policy`에 컬럼 추가:
```sql
ALTER TABLE fee_policy ADD COLUMN auto_issue BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fee_policy ADD COLUMN issue_day  SMALLINT;   -- 발행일(1~28), auto_issue 일 때만 의미
ALTER TABLE fee_policy ADD COLUMN due_day    SMALLINT;   -- 마감일(1~28)
-- 자동발행 설정 정합성: 켜져 있으면 MONTHLY + 발행/마감일 1~28 + 마감일 >= 발행일.
ALTER TABLE fee_policy ADD CONSTRAINT ck_fee_policy_auto_issue CHECK (
    auto_issue = FALSE
    OR (billing_type = 'MONTHLY'
        AND issue_day BETWEEN 1 AND 28
        AND due_day   BETWEEN 1 AND 28
        AND due_day >= issue_day)
);
```
(`SMALLINT` ↔ Java `Integer` nullable. 1~28 제한으로 말일·달 길이 엣지 회피.)

### 10. opt-in 검증 (정책 생성/수정)
`FeePolicy`에 `autoIssue`/`issueDay`/`dueDay` 필드 + 설정 메서드. 정책 수정 API(`UpdateFeePolicyRequest`)에 세 필드를 추가하고, 서비스에서 검증:
- `autoIssue=true`면 `billingType == MONTHLY`(아니면 `AutoIssueNotMonthlyException` 400), `issueDay`/`dueDay` 1~28, **`dueDay >= issueDay`**(아니면 `InvalidIssueScheduleException` 400, "마감일은 발행일과 같거나 이후여야 합니다.").
- `autoIssue=false`면 `issueDay`/`dueDay`는 무시(null 허용). DB CHECK 가 최종 가드.

### 11. 크론 — MonthlyBillIssueJob
Sprint 3 `FeeJobConfig`/`OverdueBillJob` 패턴.
- 설정: `FeeJobConfig`는 이미 `duing.fee.overdue.enabled`로 게이팅된 `@EnableScheduling`을 등록. 자동발행은 **독립 플래그**가 필요하므로, `MonthlyBillIssueJob`을 `@Component @ConditionalOnProperty(prefix="duing.fee.auto-issue", name="enabled", havingValue="true")` + `@Scheduled`로 두고, **`@EnableScheduling` 보장을 위해 `FeeAutoIssueJobConfig`(@Configuration @EnableScheduling @ConditionalOnProperty(duing.fee.auto-issue.enabled))** 를 별도로 둔다(Sprint 3 OverdueBillJob+FeeJobConfig와 동일 이중 게이팅 — prod 독립 on/off + 테스트 주입 가능).
- `@Scheduled(cron = "0 20 0 * * *", zone = "Asia/Seoul")`(매일 00:20 KST, 연체 크론 00:10과 시간 분리). `@Transactional` 아님(각 정책 발행은 자체 트랜잭션 — Sprint 3 동기화 패턴).
- run():
  1. `today = LocalDate.now(clock)`. `dayOfMonth = today.getDayOfMonth()`.
  2. `feePolicyRepository.findAutoIssueDue(dayOfMonth)` → 활성 + `billing_type=MONTHLY` + `auto_issue=true` + `issue_day <= :dayOfMonth` 정책 목록.
  3. 각 정책마다 `feeBillService.autoIssueMonthly(policy, today)`(자체 `@Transactional`) 호출 → 그 달(`today`의 YYYY-MM) 청구를 발행. **ON CONFLICT 멱등** — 이미 발행됐으면 created=0·재발송 없음(그 달 다음 날 크론에도 중복 없음 = "해당 회차 미발행" 자연 처리).
  4. 한 정책 발행 실패는 로그만 남기고 다음 정책 진행(한 동아리 오류가 배치 전체를 막지 않게).

### 12. 크론 전용 발행 경로 — autoIssueMonthly
`generate(GenerateBillsCommand)`는 `requireManager(actorId, clubId)` + 운영자 override 마감일 과거 검증을 한다. 크론은 actor가 없고 마감일은 정책 설정값이므로 **별도 내부 경로**를 둔다(`GeneralFeeBillService.autoIssueMonthly(FeePolicy policy, LocalDate today)`):
- 권한 검증 없음(크론이 권위). 정책 비활성/비-MONTHLY/auto_issue 꺼짐이면 no-op(방어).
- 회차 = `today`의 `YYYY-MM`. `billing_start_date` = 그 달 1일, `billing_end_date` = 그 달 말일(`BillingPeriodResolver.resolveMonthly` 재사용 가능). `due_date` = `LocalDate.of(today.getYear(), today.getMonth(), policy.dueDay())` — **마감일 과거 검증 없이** 정책 설정 그대로(캐치업 발행 시 마감일이 오늘보다 과거여도 정상; 다음 연체 크론에서 OVERDUE 처리됨).
- `feeBillRepository.bulkInsertBills(...)`(Sprint 1, ON CONFLICT DO NOTHING) → created 반환.
- `created > 0`이면 Sprint 3 `FeeBillsIssuedEvent` 발행(발행 알림 fan-out, AFTER_COMMIT). created=0이면 이벤트 없음(재알림 방지) — 기존 `generate`의 `created>0` 가드와 동일.

### 13. API (자동발행 설정)
신규 엔드포인트 없음 — 기존 정책 수정(`PATCH /leader/clubs/{clubId}/fee-policies/{policyId}`)에 `autoIssue`/`issueDay`/`dueDay`를 추가한다. 생성(`POST`)에도 선택적으로 받을 수 있으나, MVP는 **수정에서만** 설정(생성은 기존 그대로, 이후 수정으로 자동발행 켜기)해도 충분 — 구현 단순. (생성에도 추가할지는 구현 시 기존 폼 구조 보고 결정; 검증 로직은 공유.)

### 14. 프론트 (자동발행 설정)
- `packages/types`: `FeePolicy`/`UpdateFeePolicyPayload`에 `autoIssue`/`issueDay`/`dueDay` 추가. `packages/schemas`: 정책 수정 스키마에 세 필드 + `dueDay >= issueDay` superRefine 검증(MONTHLY일 때만).
- 정책 수정 폼(`CreatePolicyDialog`/정책 편집): **billingType이 MONTHLY일 때만** "매월 자동 발행" 토글 노출 → 켜면 발행일(1~28)·마감일(1~28) 입력. 마감일 < 발행일이면 폼 검증 에러.
- 정책 목록(`PolicyList`)에 자동발행 ON 정책은 "자동발행 매월 N일" 배지 표시(선택).

---

## 15. 권한 · 예외

- **영수증**: 회원 API는 본인 청구만(타인 → 404). 총무 API는 `requireManager` + 동아리 격리(타 동아리 청구 → 404). ACTIVE 납부 0 → 404 `ReceiptUnavailableException`.
- **자동발행 설정**: 정책 수정은 기존 `requireManager`. 검증 예외 `AutoIssueNotMonthlyException`(400)·`InvalidIssueScheduleException`(400, due<issue).
- **크론**: 권한 주체 없음(시스템). `MonthlyBillIssueJob`은 플래그로만 활성. 발행은 정책의 club_id 범위 내에서만.
- 예외는 풀네임 inner(`{Domain}Exception`) 컨벤션.

## 16. 테스트

- **영수증(통합)**: ACTIVE 납부 있는 청구 → 영수증 데이터(번호 `RCP-202607-{id}`·납부합계·잔액·납부내역) 정확; VOIDED 납부는 내역·합계에서 제외; 납부 0건/CANCELLED → 404; 타인 청구(회원)·타 동아리(총무) → 404; 비총무 → 403.
- **자동발행 검증(단위/통합)**: `autoIssue=true` + 비-MONTHLY → 400; `dueDay < issueDay` → 400; 유효 설정 저장.
- **크론(통합)**: 고정 Clock. `today.day >= issue_day`인 활성 MONTHLY auto_issue 정책 → 그 달 청구 발행(회원 수만큼, FEE_BILL_ISSUED 알림); `today.day < issue_day` → 미발행; **재실행 멱등**(2회 실행에도 청구·알림 중복 없음 = 캐치업 안전); 비활성/비-MONTHLY/auto_issue 꺼짐 정책 제외; 마감일 과거인 캐치업 발행도 성공(과거 검증 미적용). BANK/외부 호출 없음.
- 백엔드: RestAssured + TestContainers. 크론은 `@SpringBootTest(properties="duing.fee.auto-issue.enabled=true")` + 잡 직접 호출(Sprint 3 OverdueBillJobTest 패턴).

## 17. 빌드 순서 (writing-plans 에서 PR 단위 분해)

영수증과 자동발행은 독립 — 별도 PR 트랙.

**영수증**
1. `feat(backend)`: `ReceiptService`/`GeneralReceiptService` + `ReceiptResponse` + 회원·총무 API + 테스트.
2. `feat(frontend)`: 영수증 타입·API·훅 배선.
3. `feat(frontend)`: 영수증 인쇄용 페이지 + /me·총무 진입 버튼 + 인쇄 CSS.

**자동발행**
4. `feat(backend)`: V65(fee_policy auto_issue/issue_day/due_day + CHECK) + FeePolicy 필드·검증 + 정책 수정 API 확장 + 테스트.
5. `feat(backend)`: `autoIssueMonthly` 발행 경로 + `MonthlyBillIssueJob` + `FeeAutoIssueJobConfig` + env 플래그 + 멱등/캐치업 테스트.
6. `feat(frontend)`: 정책 폼 자동발행 토글·발행일·마감일(MONTHLY 한정) + 스키마 검증 + 테스트.

## 18. 이후 스프린트 (참고)
- 서버 PDF 영수증·이메일 영수증, 자동발행 장기 장애(달 넘김) 보정, MONTHLY 외 타입 자동발행.
