# 회비 관리 시스템 Sprint 3 — BANK API 자동매칭 설계서

작성일 2026-06-17 · 선행: [Sprint 1](2026-06-16-fee-system-sprint1-design.md) · [Sprint 2](2026-06-17-fee-system-sprint2-design.md)

## 1. 배경 / 목표

Sprint 1(청구 발행·조회), Sprint 2(납부·연체·인앱 알림·수납 대시보드) 위에, **동아리 계좌의 입금 거래를 BANK API로 수집해 미납 청구와 매칭**한다.

목표는 **"100% 자동매칭"이 아니라 "총무 업무 최소화"**다. 자동매칭 + 후보 추천 + 원클릭 승인 구조로 설계하며, **자동매칭률 30~50%만 달성해도 성공**으로 본다. 핵심 KPI는 *총무의 거래 확인·납부 입력 시간 감소*이지 자동화율이 아니다.

BANK API(테스트): `https://api.bankapi.co.kr`, 인증 `Authorization: Bearer {apiKey}:{secretKey}`. **농협(NH)·KB국민(KB)·우리(WR) 3개 은행, API Key당 5계좌** 한도. 입금자명(`counterparty`)은 **KB만** 제공(NH·WR은 빈 문자열).

## 2. 핵심 결정 (합의됨)

1. **거래 수집 = 총무 수동 동기화.** 자동 폴링 없음. BANK API 인증정보(계좌 비밀번호·주민번호 앞 6자리)는 동기화 시 모달 입력 → API 호출에만 사용 → **즉시 폐기**. **DB 저장·캐시·로그·이벤트 전부 금지.**
2. **DB 민감정보 최소화.** Sprint 2 `fee_account`(은행·계좌번호[AES-256-GCM 암호화]·예금주)를 그대로 재사용한다. 비밀번호·주민번호는 어떤 형태로도 저장하지 않는다.
3. **고유 식별 금액 ❌.** 회원에게 `10,037원` 같은 변형 금액을 요구하지 않는다. 청구 10,000 = 입금 10,000(회계 금액 불변). Sprint 2 `PARTIAL_PAID`와 충돌 금지.
4. **KB `counterparty` 의존 ❌(보조만).** KB 자동매칭은 보너스이며, 시스템은 KB 정보 없이도 항상 검토 큐로 처리 가능해야 한다.
5. **매칭 대상은 청구(`fee_bill`)** — 회원이 아니라 청구 단위다. (한 회원이 회비·MT비 등 같은 금액 미납을 여러 건 가질 수 있어 "회원 1명"으로 세면 오매칭이 난다.)
6. **ADMIN이 지정한 동아리만** 사용. 테스트 API 한계(3개 은행, 5계좌)를 ADMIN 허용 수(≤5)로 자연히 통제한다.
7. **매칭 성공 시 `payment`(method=`TRANSFER`)** 생성 + 거래에 링크. 자동/수동 여부는 `bank_transaction.match_status`가 보유한다. (Sprint 2의 `PaymentMethod.AUTO_MATCHED` 예약값은 본 설계에서 **미사용** — 매칭 납부의 실제 수단은 계좌이체라 `TRANSFER`가 맞다. enum 값은 제거하지 않고 미사용으로 둔다.)

## 3. 스코프

### In Scope
- ADMIN 동아리 허용/해제 + BANK API 계좌 등록/해제(`/v1/accounts`).
- 총무 수동 거래 동기화 → 멱등 적재(`transaction_hash` dedup).
- 3단계 매칭: **Tier 1 유일 청구**(전 은행) → **Tier 2 KB 이름 보조** → **Tier 3 검토 큐**.
- 검토 큐: 후보 청구 추천 + 1클릭 **승인 / 무시(IGNORE) / 매칭취소(unmatch)**.
- 매칭 성공 → `payment`(method=TRANSFER) 생성 + Sprint 2 완납 알림(`FEE_PAID_CONFIRMED`) 재사용.

### Out of Scope
- **자동 폴링·스케줄 동기화** → 향후(BANK API가 토큰/OAuth/기관 인증 지원 시 재검토). 현재는 수동 동기화 유지.
- **자동 월 발행 크론·영수증** → Sprint 4.
- **부분/임의 금액 수동 매칭**(입금액 ≠ 청구 잔액): 검토 큐는 *입금액과 잔액이 일치하는 청구*만 후보로 추천한다. 입금액이 어느 잔액과도 안 맞는 부분 입금은 총무가 거래를 **IGNORE**하고 Sprint 2 "납부 기록"으로 직접 처리한다(향후 통합 검토).
- **인증정보 저장형 자동매칭** → 향후 옵트인.
- 출금 거래 매칭(적재는 하되 `IGNORED`로 시작, 매칭 대상 아님).

## 4. 데이터 모델 (Flyway V63)

새 마이그레이션 1개. 기존 마이그레이션 수정 금지, snake_case, `TIMESTAMP WITH TIME ZONE`, `BIGSERIAL`, `VARCHAR + CHECK`, FK `ON DELETE RESTRICT`, `ENABLE ROW LEVEL SECURITY`(V59 패턴). 생성 순서: `bank_matching_setting` → `bank_transaction` → `payment` 컬럼 추가.

### 4.1 bank_matching_setting — ADMIN 허용 상태
```sql
CREATE TABLE bank_matching_setting (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT NOT NULL UNIQUE REFERENCES club(id) ON DELETE RESTRICT,
    active        BOOLEAN NOT NULL DEFAULT FALSE,   -- ADMIN 허용 여부
    api_registered BOOLEAN NOT NULL DEFAULT FALSE,  -- BANK API /v1/accounts 등록 완료 여부
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
ALTER TABLE bank_matching_setting ENABLE ROW LEVEL SECURITY;
```
- 매칭 가능 = `active = TRUE` **AND** `fee_account` 존재 **AND** `fee_account.bank ∈ {NH, KB, WOORI}` **AND** `api_registered = TRUE`.

### 4.2 bank_transaction — 수집 거래 (멱등 적재)
```sql
CREATE TABLE bank_transaction (
    id                BIGSERIAL PRIMARY KEY,
    club_id           BIGINT NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    bank_code         VARCHAR(10) NOT NULL,            -- NH / KB / WR
    transaction_at    TIMESTAMP WITH TIME ZONE NOT NULL, -- date+time 합성(Asia/Seoul)
    amount            BIGINT NOT NULL,                 -- 거래금액(원)
    balance           BIGINT,                          -- 거래 후 잔액(해시 입력·중복 식별)
    counterparty      VARCHAR(100),                    -- 입금자명(KB만 채워짐)
    transaction_type  VARCHAR(20) NOT NULL CHECK (transaction_type IN ('DEPOSIT','WITHDRAWAL')),
    match_status      VARCHAR(20) NOT NULL CHECK (match_status IN ('PENDING','AUTO_MATCHED','MANUAL_MATCHED','IGNORED')),
    matched_fee_bill_id BIGINT REFERENCES fee_bill(id) ON DELETE RESTRICT,  -- 매칭된 청구(회원은 fee_bill.user_id로 도출)
    transaction_hash  VARCHAR(64) NOT NULL UNIQUE,     -- SHA-256 정규화 해시(멱등 적재)
    raw_payload       JSONB NOT NULL,                  -- BANK API 거래 "응답" 객체 원본(거래 1건). 요청 인증정보(비번·주민번호)는 절대 미포함
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_bank_tx_club_status ON bank_transaction (club_id, match_status) WHERE deleted_at IS NULL;
ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;
```
- **`transaction_hash`** = `SHA-256( club_id ∥ bank_code ∥ transaction_at(ISO) ∥ amount ∥ balance ∥ transaction_type ∥ counterparty ∥ description ∥ branch ∥ memo )` (각 필드 `'|'` 구분, null/빈값은 빈 문자열로 정규화). BANK API 가 **거래 고유 ID를 주지 않으므로 가용한 모든 식별 필드**(counterparty 외 description·branch·memo 까지)를 포함해 NH·WR 빈 counterparty 환경에서도 중복 적재를 최소화한다. **파싱된 정규화 필드**로 계산한다(JSON 블롭 통째 해시 금지 — 키 순서·공백 차이로 같은 거래가 다른 해시가 날 수 있음). `club_id` 포함 → 해시만으로 전역 유니크(동아리 격리 자동). 적재는 `INSERT … ON CONFLICT (transaction_hash) DO NOTHING`.
- DEPOSIT 은 `match_status='PENDING'`으로, WITHDRAWAL 은 `'IGNORED'`로 적재 시작.
- `matched_fee_bill_id` 는 매칭 시 세팅. 생성되는 `payment.fee_bill_id` 와 동일 청구를 가리킨다.

### 4.3 payment 컬럼 추가
```sql
ALTER TABLE payment ADD COLUMN bank_transaction_id BIGINT REFERENCES bank_transaction(id) ON DELETE RESTRICT;
CREATE INDEX idx_payment_bank_tx ON payment (bank_transaction_id) WHERE deleted_at IS NULL;
```
- 매칭으로 생성된 납부만 값을 가진다(수동 납부는 NULL). UNIQUE 제약은 두지 않는다(매칭취소 → 재매칭 시 VOIDED 납부가 같은 거래를 가리킨 채 남을 수 있음). "거래당 ACTIVE 납부 1건" 불변식은 서비스 로직(`match_status`)이 보장한다.

## 5. 매칭 규칙

**입력**: `match_status='PENDING'` 인 DEPOSIT 거래 1건(club_id, amount, counterparty, bank_code).
**후보집합 C** = 같은 동아리의 미납 청구(`status ∈ {PENDING, PARTIAL_PAID, OVERDUE}`) 중 **잔액(remaining = amount − ACTIVE 납부합계) == 입금액** 인 `fee_bill` 목록. (잔액 기준이라 PARTIAL_PAID 안전.)

- **Tier 1 — 유일 청구 자동매칭 (전 은행).** `|C| == 1` → 그 청구를 자동매칭(`AUTO_MATCHED`). 기간이 지나며 같은 금액 미납이 줄어 한 건만 남으면 코드·이름 없이 정확히 확정된다.
- **Tier 2 — KB 이름 보조 (자동).** `|C| ≥ 2` **AND** `bank_code == 'KB'` **AND** `counterparty` 비어있지 않음일 때, C 를 `fee_bill.user_id 의 회원명 == counterparty`(정규화 비교: 공백 제거)로 거른다. 정확히 1건 남으면 → 자동매칭(`AUTO_MATCHED`). 동명이인(2명+)·잔여 2건+ → Tier 3.
- **Tier 3 — 검토 큐.** `|C| == 0` 또는 위에서 1건으로 못 좁힌 경우 → `PENDING` 유지(검토 큐 노출). 후보 = C(0건이면 빈 후보). 총무가 후보 1건 **승인**(→`MANUAL_MATCHED`) 또는 거래 **무시**(→`IGNORED`).

자동매칭(Tier 1·2)·수동승인 모두 **동일한 청구→납부 생성 경로**를 탄다(§9.3). `|C| ≥ 2` 의 자동 시도 시 동시성 안전을 위해 Sprint 2 비관적 잠금을 재사용한다(§9.3).

## 6. BANK API 연동

`global/bank/BankApiClient`(인터페이스) + `BankApiHttpClient`(구현, `RestClient`/`HttpClient`). 인증 헤더 `Authorization: Bearer ${BANK_API_KEY}:${BANK_API_SECRET}`. 키는 **env 전용**(`BANK_API_KEY`, `BANK_API_SECRET`) — 코드/yml 하드코딩 금지, `.env.example` 문서화.

| 용도 | 메서드 | 엔드포인트 |
|---|---|---|
| 계좌 등록 | `registerAccount(bankCode, accountNumber)` | `POST /v1/accounts` |
| 계좌 해제 | `deleteAccount(bankCode, accountNumber)` | `DELETE /v1/accounts` |
| 등록 확인 | `isRegistered(bankCode, accountNumber)` | `POST /v1/accounts/check` |
| 거래 조회 | `getTransactions(bankCode, accountNumber, accountPassword, residentNumber, startDate, endDate)` | `POST /v1/transactions` |

- **bank_code 매핑**: `fee_account.bank`(Sprint 2 enum) → BANK API 코드. `NH→NH`, `KB→KB`, `WOORI→WR`. 그 외 은행은 매칭 불가(허용돼도 비활성 안내).
- **응답 파싱**: `transactions[].{date, time, type('deposit'/'withdrawal'), amount, balance, counterparty, ...}`. `type` 소문자 → enum 대문자 매핑. `date+time` → `transaction_at`(Asia/Seoul).
- **에러 처리**: 401(인증 실패)·403 `ACCOUNT_NOT_REGISTERED`·429(rate limit, `retryAfter`)·400(파라미터)·`ACCOUNT_LIMIT_EXCEEDED`(등록 한도 5 초과) → 각각 도메인 예외로 변환해 사용자에게 한국어 안내. **민감 파라미터(password·resident)는 예외 메시지·로그에 절대 싣지 않는다.**

## 7. 동기화 흐름

1. 총무가 회비 관리 화면에서 **[거래내역 동기화]** 클릭 → 모달: 은행(동아리 `fee_account` 은행, 읽기전용 표시) · **계좌 비밀번호** · **주민번호 앞 6자리** · [동기화].
2. `POST /leader/clubs/{clubId}/bank-transactions/sync` body `{ accountPassword, residentNumber }`.
3. 서버:
   - 권한(총무) + 매칭 가능(§4.1) 검증.
   - `fee_account.accountNumber` 복호화, `bank_code` 매핑.
   - 조회 기간 = `max(마지막 적재 거래일 − 1일, 오늘 − 14일)` ~ 오늘(최대 윈도우 14일, rate limit 보호). 하이픈 없는 `YYYYMMDD`.
   - `BankApiClient.getTransactions(...)` 호출.
   - 각 거래: 정규화 → `transaction_hash` 계산 → `INSERT … ON CONFLICT DO NOTHING`. DEPOSIT=PENDING, WITHDRAWAL=IGNORED.
   - **인증정보(password·resident) 즉시 폐기** — 변수 스코프 종료, 어디에도 저장·로그 금지.
   - 신규 PENDING DEPOSIT 들에 매칭 엔진(§5) 실행 → Tier 1·2 자동매칭.
   - 응답 `{ fetched, newlyStored, autoMatched, pendingReview }`.
4. 프론트: 결과 토스트("N건 적재 · M건 자동매칭 · K건 검토 필요") + 검토 큐 갱신.

## 8. API 목록

### ADMIN (전역 운영자 — 총동연 관리 페이지)
- `PUT  /admin/clubs/{clubId}/bank-matching` `{ active }` → 등록/해제. **외부 부수효과 먼저, DB 나중(원자성)**:
  - `active=true`: ① `fee_account` 존재·은행 적격(`bank ∈ {NH,KB,WOORI}`) 검증 → ② **BANK API 계좌 등록 호출(`POST /v1/accounts`)** → ③ **성공 시에만** DB 반영(`active=api_registered=true`). 등록 실패(한도 초과·인증 등)면 **DB 미변경**(`active=false` 유지) + 400 안내. **"DB 먼저 바꾸고 API 호출" 순서 금지** — DB 상태 ≠ BANK API 실제 상태 불일치 방지.
  - `active=false`: ① **BANK API 등록 해제(`DELETE /v1/accounts`)** → ② 성공 시 DB `active=false`(슬롯 반환). (이미 미등록이면 멱등 처리.)
  - 200. 5계좌 초과 → `ACCOUNT_LIMIT_EXCEEDED` → 400("등록 한도(5)를 초과했습니다"), 허용 동아리 ≤5 운영.
- `GET  /admin/clubs/bank-matching` → 동아리 목록(검색) + 각 동아리 **적격성**(fee_account 존재·은행 적격 여부·사유) + 등록 상태 + 전역 슬롯 현황(`GET /v1/accounts` 의 `registeredCount/maxAccounts/remaining`). 총동연이 한눈에 보고 등록/해제.

### 총무 (LEADER/OFFICER)
- `POST /leader/clubs/{clubId}/bank-transactions/sync` `{ accountPassword, residentNumber }` → 동기화. 200 `SyncResultResponse`.
- `GET  /leader/clubs/{clubId}/bank-transactions?status=` → 거래 목록(검토 큐). PENDING 항목은 **후보 청구**(C, 각 회원·청구종류·잔액) 동봉. 후보는 **① `due_date` 오름차순(가장 급한 청구) → ② `created_at` 내림차순 → ③ `fee_bill_id` 오름차순**으로 정렬해 총무가 가능성 높은 후보를 먼저 본다. 200 페이지.
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/approve` `{ feeBillId }` → 후보 1건 승인 → `MANUAL_MATCHED` + payment 생성. 200/201.
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/ignore` → `IGNORED`. 204.
- `POST /leader/clubs/{clubId}/bank-transactions/{txId}/unmatch` → 매칭취소: 연결된 payment VOID + 거래 `PENDING` 복귀. 204.

### 회원
- 변경 없음. 회원은 Sprint 2 그대로 `회비 10,000원 / 농협 / 계좌번호 / 입금 후 최대 10분 내 반영` 안내만 본다(고유 금액 요구 없음). 매칭 완료 시 Sprint 2 `FEE_PAID_CONFIRMED` 알림 자동 수신.

## 9. 도메인 서비스

### 9.1 BankMatchingAdminService
ADMIN 허용/해제 + 적격성 검증(fee_account·은행). **외부 API 등록/해제를 먼저 호출해 성공한 뒤에만 `bank_matching_setting` DB 상태를 반영한다**(§8 원자성 — DB↔BANK API 상태 불일치 방지).

### 9.2 BankTransactionSyncService
동기화 오케스트레이션: 적격 검증 → 계좌번호 복호화 → BANK API 조회 → 정규화·해시·멱등 적재 → 매칭 엔진 호출 → 결과 집계. **인증정보는 메서드 인자로만 흐르고 즉시 폐기.**

### 9.3 TransactionMatcher + 매칭 납부 생성
- `TransactionMatcher.match(tx)`: §5 규칙으로 후보 C 산출 → Tier 1/2 판정 → 자동매칭 또는 PENDING 유지.
- **청구→납부 생성**(자동·수동 공통): 대상 `fee_bill`을 **Sprint 2 `findByIdAndClubIdForUpdate` 비관적 잠금**으로 잠그고 잔액 재확인(== tx.amount) 후 `payment` 생성(method=TRANSFER, amount=잔액, paid_at=tx.transaction_at 날짜, recorded_by=동기화/승인한 총무, bank_transaction_id=tx.id) → Sprint 2 `FeeBillStatusCalculator`로 상태 재계산 → `bank_transaction`(match_status, matched_fee_bill_id) 갱신. 동시 매칭 경합 시 잔액 불일치로 두 번째는 자동매칭 실패(PENDING 유지) → 검토 큐.
- **매칭취소(unmatch)**: 연결 payment를 Sprint 2 VOID 경로로 취소 → 거래 `PENDING` 복귀 + `matched_fee_bill_id=NULL`.
- 매칭 알림은 **신규 타입 없이** Sprint 2 `FEE_PAID_CONFIRMED`(AFTER_COMMIT 이벤트)를 재사용하되 **문구만 매칭 경로로 구분**한다(회원 혼란 방지):
  - **자동매칭(Tier 1·2)**: "회비 납부가 **자동으로** 확인되었습니다."
  - **수동 승인(검토 큐) 및 Sprint 2 직접 기록**: "회비 납부가 확인되었습니다."(기존 문구 유지)
  - 구현: Sprint 2 `FeePaymentConfirmedEvent`/`FeePaymentConfirmedListener`에 `autoMatched`(boolean, 기본 false) 차원을 더해 리스너가 본문을 분기한다. Tier 1·2 자동매칭만 `true`로 발행. (작은 Sprint 2 확장 — 타입·dedupKey 불변.)

## 10. 권한 · 예외 · 보안

- **권한**: ADMIN 엔드포인트 = 전역 운영자만. 총무 엔드포인트 = `requireManager`(LEADER/OFFICER). 동아리 격리(clubId 경로 + 조회 가드).
- **민감정보 비노출(핵심)**: BANK API 요청 파라미터 `accountPassword`·`residentNumber` 는 **`raw_payload`·로그·예외 메시지·이벤트·감사 로그 어느 곳에도 포함될 수 없다.** 구체적으로 (1) DB(컬럼·`raw_payload`)·캐시·이벤트·감사 로그 저장 금지 — `raw_payload` 는 BANK API **응답(거래)** 만 담고 요청 인증정보는 절대 안 담는다 (2) 로그 출력 금지 — 요청 DTO에 `@ToString`/`@Slf4j` 노출 금지(필드 마스킹), `GlobalExceptionHandler`·접근 로그가 본문을 찍지 않도록 확인, 검증 실패 메시지에 값 미포함, BANK API 호출 코드도 이 값을 로깅하지 않음 (3) 처리(API 호출) 후 즉시 메모리 해제(변수 스코프 종료). → §12 보안 회귀 테스트로 가드.
- **예외(풀네임 inner)**: `BankMatchingNotEnabledException`(403/409), `UnsupportedBankException`(400), `BankApiException`(502, BANK API 4xx/5xx 변환 — rate limit/인증/미등록 구분 code), `TransactionNotFoundException`(404), `InvalidMatchCandidateException`(400, 후보 아님/잔액 불일치/취소된 청구), `AlreadyMatchedException`(409, PENDING 아님).
- RLS: 신규 테이블 모두 `ENABLE ROW LEVEL SECURITY`(V59 패턴, 앱 소유 롤 우회).

## 11. 프론트

- **ADMIN 총동연 관리 페이지 — "BANK API 동아리 등록"** (기존 admin 영역에 섹션 추가):
  - 동아리 목록(검색) — 각 행: 동아리명 · **적격성**(fee_account 존재·은행 적격 여부, 부적격 시 사유: "회비 계좌 미등록" / "미지원 은행(NH·KB·우리만)") · **등록 상태**(등록됨/미등록) · [등록]/[해제] 버튼(부적격이면 비활성).
  - 상단에 **전역 슬롯 현황** `registeredCount / maxAccounts(5) · 남은 N` 표시 → 한도 차면 [등록] 비활성 + 안내.
  - [등록] = `PUT .../bank-matching {active:true}`(API 등록 성공 시에만 반영), [해제] = `{active:false}`.
- **게이팅(등록 동아리만 사용)**: 등록(`active && api_registered && 은행 적격`)된 동아리에서만 총무의 "거래" 탭(동기화·검토 큐)이 노출·동작한다. 미등록 동아리는 탭 자체를 숨기고, 백엔드도 총무 동기화/검토 엔드포인트에서 매칭 가능 여부(§4.1)를 재검증해 차단한다(프론트 우회 방지).
- **총무 회비 관리 — 신규 "거래" 탭(또는 청구 탭 내 섹션)**:
  - **[거래내역 동기화]** 버튼 → 모달(계좌 비밀번호·주민번호6) → 동기화 → 결과 토스트. (매칭 미허용/미지원 은행이면 버튼 비활성 + 안내.)
  - **검토 큐**: PENDING 입금 카드 — 입금액·입금시각·후보 청구 리스트(회원명·청구종류·잔액) + 각 후보 [승인] · [무시]. 자동매칭/수동매칭 거래는 이력으로 노출 + [매칭취소].
- packages 배선: `bank.ts` 타입(BankTransaction·MatchStatus·SyncResult·후보), api 클라이언트, hooks(동기화 mutation·거래 목록 query·승인/무시/매칭취소 mutation, 무효화), schemas(동기화 입력 — 비번/주민번호6 검증, **클라이언트도 미저장**).
- 민감정보 모달 입력값은 제출 후 즉시 폼 리셋, 어디에도 보관하지 않는다.

## 12. 테스트

- **매칭 규칙(단위)**: Tier 1 `|C|==1` 자동; `|C|>=2` 비KB → 검토 큐; `|C|>=2` KB 이름으로 1건 좁힘 → 자동, 동명이인 → 검토 큐; `|C|==0` → 검토 큐; PARTIAL_PAID 잔액 기준 후보 산출.
- **멱등 적재(통합)**: 같은 기간 2회 동기화 → 중복 거래 0건 추가(`transaction_hash` ON CONFLICT). 정규화 필드 동일 시 같은 해시.
- **동기화·매칭 통합**: 신규 입금 → 자동매칭 → payment(TRANSFER, bank_transaction_id) 생성 + 청구 PAID + `FEE_PAID_CONFIRMED` 알림. 동시성(같은 청구로 두 거래 자동매칭 시도) → 한 건만 성공.
- **검토 큐**: 승인 → MANUAL_MATCHED + payment; 무시 → IGNORED; 매칭취소 → payment VOID + 거래 PENDING 복귀; 후보 아닌 feeBillId 승인 → 400. **후보 정렬**(due_date asc → created_at desc → id asc) 검증.
- **ADMIN 등록 원자성**: BANK API 스텁이 등록 성공 → `active=api_registered=true`; 등록 실패(한도초과/에러) → **DB 미변경**(active=false 유지); 해제도 API 해제 성공 후 DB 반영. (DB 먼저 변경 안 함.)
- **알림 문구**: 자동매칭(Tier 1·2) 완납 → "자동으로 확인", 수동 승인·직접 기록 완납 → "확인되었습니다"(타입·dedupKey 동일).
- **권한·격리**: 비총무 403, 타 동아리 거래 404, 비허용 동아리 동기화 차단.
- **보안(회귀 가드)**: 동기화 요청·예외 경로에서 password/resident 가 로그·응답·DB 어디에도 나타나지 않음을 단언.
- 백엔드: RestAssured + TestContainers(실 Postgres). BANK API 는 테스트에서 `BankApiClient` 스텁/목으로 대체(실제 외부 호출 금지).

## 13. 빌드 순서 (writing-plans 에서 PR 단위 분해)

0. (선택) 테스트 인프라 — `IntegrationTestBase` TRUNCATE 에 `bank_transaction`·`bank_matching_setting` 추가.
1. `feat(backend)`: V63 마이그레이션 + `BankTransaction`/`BankMatchingSetting` 엔티티 + payment.bank_transaction_id + 리포지토리.
2. `feat(backend)`: `BankApiClient` + HTTP 구현 + 에러 변환 + env 배선(`BANK_API_KEY`/`SECRET`), BANK API 는 통합테스트에서 스텁.
3. `feat(backend)`: ADMIN 허용/해제 + 계좌 등록/해제 API.
4. `feat(backend)`: 동기화(멱등 적재) + 인증정보 비저장·비로깅 가드.
5. `feat(backend)`: 매칭 엔진(Tier 1/2/3) + 청구→납부 생성(잠금) + 검토 큐 승인/무시/매칭취소.
6. `feat(frontend)`: packages 배선(타입·api·훅·스키마).
7. `feat(frontend)`: 총무 동기화 모달 + 검토 큐 UI.
8. `feat(frontend)`: ADMIN 허용 토글 + 슬롯 현황.

## 14. 이후 스프린트 (참고)

- **Sprint 4**: 자동 월 발행 크론, 영수증, (BANK API 토큰/OAuth 지원 시) 자동 폴링·인증정보 옵트인 저장, 부분/임의 금액 수동 매칭 통합.
