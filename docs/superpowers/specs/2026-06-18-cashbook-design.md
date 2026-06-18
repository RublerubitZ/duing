# 회비 시스템 Sprint 5 — 금전출납부(Cashbook) 설계서

작성일 2026-06-18 · 선행: [Sprint 3 BANK 자동매칭](2026-06-17-fee-system-sprint3-design.md) · [Sprint 4 영수증·자동발행](2026-06-18-fee-system-sprint4-design.md)

## 1. 배경 / 목표

동아리는 회비 외에도 후원금·지원금 수입과 MT·회식·비품 등 지출을 관리해야 한다. Sprint 3 BANK API 연동으로 계좌 입출금 거래(`bank_transaction`)는 수집되고 있으나, 출금은 숨겨져 있고 입금도 매칭 검토용으로만 노출되어 **회계 장부로서의 조회가 없다**.

금전출납부는 "계좌 거래내역 조회"가 아니라 **동아리 회계 장부** 기능이다. 따라서 **BANK API 사용 여부와 무관하게 모든 동아리가 동일한 UI·기능**을 쓸 수 있어야 한다. 이를 위해 단순 BANK 거래 뷰(A)나 순수 수기 장부(B)가 아닌, **수동 입력 + BANK 자동 입력을 하나의 장부로 통합하는 C-lite** 방식을 채택한다.

## 2. 핵심 결정 (합의됨)

- **신규 엔티티 `cashbook_entry`** 도입. 모든 수입·지출을 이 한 테이블로 관리(단식 장부, 복식부기 아님).
- **C-lite**: `source = MANUAL`(총무 수기) + `source = BANK_API`(동기화 자동 생성)을 하나의 장부로 통합. BANK API는 장부를 **자동으로 채워주는 도구**일 뿐, 기능의 전제조건이 아니다.
- **카테고리 = 코드 체계**(`categoryCode` enum) + `customCategory`(OTHER일 때만). 통계·집계 일관성 목적.
- **잔액 = 장부 잔액(`bookBalance`)** = ACTIVE 수입 합 − ACTIVE 지출 합. 실제 은행 잔액과 구분해 표기.
- `bank_transaction`(원본 거래 저장소)은 **유지·불변**, `cashbook_entry`(회계 장부)와 **역할 분리**.
- **이중계상 방지**: 장부 자동 생성은 `bank_transaction`에서만. 회비 매칭으로 생기는 `Payment`(회비 정산)는 장부 소스가 아니다. 현금 회비처럼 은행 미경유 수입은 총무가 수동 입력.
- **권한**: 조회·기록·수정 모두 **총무(LEADER/OFFICER)** 전용(`requireManager`). 회원 공개는 범위 외.
- **BANK 자동 항목**: 금액·날짜·유형·설명 **불변**, 총무는 **카테고리·메모만** 보정. **삭제 불가**(실제 입출금 보존).

## 3. 스코프

### In Scope (Sprint 5 MVP)
- `cashbook_entry` 테이블(V66) + 기존 `bank_transaction` 일괄 백필.
- 수동 수입/지출 등록·수정·삭제(MANUAL).
- BANK 동기화 시 거래(입금→수입, 출금→지출) 자동 생성(BANK_API, 멱등) + 카테고리·메모 보정.
- 금전출납부 조회: 필터(유형·카테고리·기간·검색), 시간순 목록, 총수입·총지출·**장부 잔액** 요약.

### Out of Scope (후속)
- 복식부기·계정과목·회계분개·예산관리·결산서·감사기능·잔액조정.
- 파일 첨부 **업로드**(영수증 사진 등) — `attachment_url` 컬럼만 예약, 업로드 UI·저장소 연동은 후속.
- 회원 공개(투명성 조회) — 총무 전용으로 시작.
- 실제 계좌 잔액 병기, CSV/엑셀 내보내기, 월별 카테고리 통계 차트.

---

## 4. 데이터 모델 (Flyway V66)

기존 마이그레이션 수정 금지. 최신 V65(Sprint 4) → 신규 **V66**.

```sql
CREATE TABLE cashbook_entry (
    id                 BIGSERIAL PRIMARY KEY,
    club_id            BIGINT       NOT NULL REFERENCES club(id) ON DELETE RESTRICT,
    entry_type         VARCHAR(10)  NOT NULL,   -- INCOME | EXPENSE
    source             VARCHAR(10)  NOT NULL,   -- MANUAL | BANK_API
    category_code      VARCHAR(20)  NOT NULL,   -- FEE/SPONSOR/SUBSIDY/MT/DINING/SNACK/SUPPLY/MARKETING/OTHER
    custom_category    VARCHAR(40),             -- category_code=OTHER 일 때만
    amount             BIGINT       NOT NULL,   -- 양수, 부호는 entry_type
    description        VARCHAR(100) NOT NULL,
    transaction_date   DATE         NOT NULL,
    memo               VARCHAR(200),
    attachment_url     VARCHAR(500),            -- 예약(업로드는 후속)
    bank_transaction_id BIGINT      REFERENCES bank_transaction(id) ON DELETE RESTRICT,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_cashbook_entry_type CHECK (entry_type IN ('INCOME','EXPENSE')),
    CONSTRAINT chk_cashbook_source     CHECK (source IN ('MANUAL','BANK_API')),
    CONSTRAINT chk_cashbook_amount     CHECK (amount > 0),
    -- 카테고리 코드가 유형(수입/지출)에 유효해야 한다(OTHER는 공용).
    CONSTRAINT chk_cashbook_category CHECK (
        (entry_type = 'INCOME'  AND category_code IN ('FEE','SPONSOR','SUBSIDY','OTHER'))
        OR (entry_type = 'EXPENSE' AND category_code IN ('MT','DINING','SNACK','SUPPLY','MARKETING','OTHER'))
    ),
    -- customCategory 는 OTHER 일 때만 채울 수 있다.
    CONSTRAINT chk_cashbook_custom_category CHECK (custom_category IS NULL OR category_code = 'OTHER'),
    -- source 와 bank_transaction_id 연결 일관성.
    CONSTRAINT chk_cashbook_bank_link CHECK (
        (source = 'BANK_API' AND bank_transaction_id IS NOT NULL)
        OR (source = 'MANUAL' AND bank_transaction_id IS NULL)
    )
);

-- 한 BANK 거래당 장부 항목 1건(재동기화 멱등). 소프트삭제 제외.
CREATE UNIQUE INDEX uk_cashbook_bank_tx ON cashbook_entry (bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_cashbook_club_date ON cashbook_entry (club_id, transaction_date DESC)
    WHERE deleted_at IS NULL;
ALTER TABLE cashbook_entry ENABLE ROW LEVEL SECURITY;  -- V59 전 테이블 RLS 정책

-- 기존에 쌓인 BANK 거래를 장부로 일괄 백필(이미 BANK 쓰던 동아리는 과거 거래도 즉시 노출).
INSERT INTO cashbook_entry (
    club_id, entry_type, source, category_code, custom_category, amount,
    description, transaction_date, memo, bank_transaction_id, created_at, updated_at)
SELECT bt.club_id,
       CASE WHEN bt.transaction_type = 'DEPOSIT' THEN 'INCOME' ELSE 'EXPENSE' END,
       'BANK_API', 'OTHER', NULL, bt.amount,
       COALESCE(NULLIF(bt.counterparty, ''),
                CASE WHEN bt.transaction_type = 'DEPOSIT' THEN '입금' ELSE '출금' END),
       (bt.transaction_at AT TIME ZONE 'UTC')::date, NULL, bt.id, now(), now()  -- §6 타임존 규약 참조
FROM bank_transaction bt
WHERE bt.deleted_at IS NULL;
```

(엔티티는 `BaseEntity`(id/created_at/updated_at/deleted_at) 상속 + `@SQLDelete`/`@SQLRestriction` 소프트삭제, `@Enumerated(STRING)`. `category_code`/`custom_category`/`amount`/`description`/`transaction_date`/`memo`/`attachment_url`/`bank_transaction_id` 매핑. `ddl-auto=validate` 정합 — 컬럼 타입/nullable 일치 필수, BIGINT↔Long·DATE↔LocalDate·VARCHAR↔String.)

## 5. 카테고리 코드 체계

`CashbookCategory` enum(단일):
- **수입(INCOME)**: `FEE`(회비), `SPONSOR`(후원금), `SUBSIDY`(지원금), `OTHER`(기타)
- **지출(EXPENSE)**: `MT`(MT), `DINING`(회식), `SNACK`(간식), `SUPPLY`(비품), `MARKETING`(홍보비), `OTHER`(기타)
- `OTHER`는 수입·지출 공용. 한글 표시명은 프론트 라벨 맵(`@/app/_lib/...`)이 보유.

규칙(앱 검증 + DB CHECK 이중):
- `categoryCode`는 `entryType`에 유효해야 한다(§4 `chk_cashbook_category`). 위반 시 `InvalidCashbookCategoryException`(400).
- `categoryCode != OTHER` → `customCategory`는 null이어야 한다(보내면 400). `categoryCode == OTHER` → `customCategory` 선택(최대 40자).
- BANK 자동 항목 기본값 = `categoryCode=OTHER`, `customCategory=null`(미분류). 총무가 실제 코드로 보정 가능.

## 6. BANK API 연동

- **자동 생성**: 동기화(Sprint 3 거래 적재 경로)에서 신규 `bank_transaction`이 영속될 때, 1:1로 `cashbook_entry`를 생성한다. `transaction_type` DEPOSIT→INCOME, WITHDRAWAL→EXPENSE. `source=BANK_API`, `amount=bt.amount`, `transaction_date=(bt.transaction_at AT TIME ZONE 'UTC')::date`, `description=counterparty 또는 입금/출금`, `categoryCode=OTHER`, `bank_transaction_id=bt.id`. **매칭 상태(PENDING/IGNORED 등) 무관** — 돈이 움직였으면 장부에 기록.
- **타임존 규약(중요)**: `bank_transaction.transaction_at`은 BANK API가 주는 **KST 벽시계**를 naive `LocalDateTime`으로 적재한 값이고, 앱은 고정 TZ 없이(JVM=UTC) 운영되어 이 값이 UTC instant로 저장된다. 따라서 그 **저장된 벽시계(=KST 날짜)를 복원**하려면 `AT TIME ZONE 'UTC'`(naive 복원)를 쓴다. `AT TIME ZONE 'Asia/Seoul'`을 쓰면 instant를 한 번 더 +9h 변환해 KST 저녁 거래의 날짜가 +1일 어긋난다. 이는 `RecruitmentStatsRepositoryImpl`이 timestamp를 `AT TIME ZONE 'UTC'`로 다루는 앱의 기존 규약과 일관된다. (근본 TZ 모호성·bare `now()` 정리는 별도 전역 하드닝 트랙으로 분리.)
- **멱등성**: `uk_cashbook_bank_tx`(부분 유니크)로 재동기화해도 중복 안 생김. 생성은 `INSERT ... ON CONFLICT (bank_transaction_id) WHERE ... DO NOTHING` 또는 존재 검사로 처리.
- **이중계상 없음**: 장부는 `bank_transaction`만 계상. 회비 매칭으로 만들어진 `Payment`는 장부 소스가 아니다(매칭된 입금도 장부엔 그 입금 1건만).
- **보정/삭제**: BANK_API 항목은 `categoryCode`·`customCategory`·`memo`만 수정 가능(금액·날짜·유형·설명 등 그 외 필드 변경 요청 → 400 `CashbookEntryImmutableException`). **삭제 불가**(→ 409). MANUAL 항목은 entryType 제외 전체 수정·소프트삭제 가능.
- **백필**: §4 V66 INSERT...SELECT로 기존 `bank_transaction` 일괄 생성(멱등 유니크가 이후 동기화와 충돌 방지).

## 7. API (총무 전용, `requireManager`)

베이스 `/api/v1/leader/clubs/{clubId}/cashbook` (Swagger `LeaderCashbookApi` + `LeaderCashbookController`, 클럽 격리 + `requireManager`).

- `GET /cashbook` — 목록. 쿼리: `entryType`(INCOME/EXPENSE, 옵션), `categoryCode`(옵션), `from`/`to`(거래일 범위, 옵션), `keyword`(검색어 — description/memo/customCategory 부분일치, 옵션), `page`/`size`. 정렬 `transaction_date DESC, id DESC`. → `PageResponse<CashbookEntryResponse>`.
- `GET /cashbook/summary` — 요약(목록과 **동일 필터** 적용, 페이지 무관). → `CashbookSummaryResponse(totalIncome, totalExpense, bookBalance)`.
- `POST /cashbook` — 수동 항목 등록(`source=MANUAL` 강제). → 201 `ApiResponse<Long>`(id).
- `PATCH /cashbook/{entryId}` — 수정. MANUAL=entryType 제외 전체(category/custom/amount/description/transaction_date/memo), BANK_API=`categoryCode`·`customCategory`·`memo`만. → 204.
- `DELETE /cashbook/{entryId}` — 소프트삭제. MANUAL만 허용, BANK_API → 409. → 204.

(동시성: 단순 단건 수정/삭제라 비관 잠금 불요. 자동 생성은 유니크 인덱스가 멱등 보장.)

## 8. 요청/응답 DTO

```text
CashbookEntryResponse(
  id, entryType,            // INCOME | EXPENSE
  source,                   // MANUAL | BANK_API
  categoryCode, customCategory,
  amount, description, transactionDate, memo,
  attachmentUrl,            // 현재 항상 null(예약)
  bankTransactionId,        // BANK_API만
  createdAt
)

CashbookSummaryResponse(totalIncome, totalExpense, bookBalance)   // bookBalance = totalIncome - totalExpense

CreateCashbookEntryRequest(
  entryType(@NotNull), categoryCode(@NotNull), customCategory(@Size max 40, 옵션),
  amount(@NotNull @Positive), description(@NotBlank @Size max 100),
  transactionDate(@NotNull, LocalDate), memo(@Size max 200, 옵션)
)   // source 는 서버가 MANUAL 강제

UpdateCashbookEntryRequest(   // 부분 수정, 모두 nullable
  categoryCode?, customCategory?, amount?, description?, transactionDate?, memo?
)   // BANK_API 항목은 categoryCode/customCategory/memo 외 필드가 오면 400
```

검증(생성·수정 공유): entryType↔categoryCode 유효성, customCategory는 OTHER일 때만, amount>0. 예외: `InvalidCashbookCategoryException`(400), `CashbookEntryImmutableException`(400, BANK_API 불변 필드 변경), `CashbookEntryNotFoundException`(404), BANK_API 삭제 시 `CashbookEntryNotDeletableException`(409). 풀네임 inner 컨벤션.

## 9. 프론트 (총무 회비 관리에 "장부" 탭)

- `ClubFeesPage` 탭에 **"장부"** 추가: 정책 / 청구 / 계좌 / 거래 / **장부**.
- **장부 화면**: 상단 **요약 카드**(총수입·총지출·**장부 잔액**) → 필터 바(전체/수입/지출 토글 · 카테고리 select · 기간 from~to · 검색어) → 시간순 목록(날짜 · 설명 · 카테고리 배지 · +/− 금액 색 구분; BANK_API 항목은 자동 배지) → **"수입 등록" / "지출 등록"** 버튼.
- **등록/수정 다이얼로그**(shadcn Dialog + react-hook-form + zod): 유형(등록 시 버튼으로 결정) · 카테고리(코드 select, OTHER 선택 시 customCategory 입력 노출) · 금액 · 설명 · 거래일 · 메모. BANK_API 항목 수정은 카테고리·메모만 활성, 나머지 비활성 + "자동 생성 항목" 안내. 삭제는 MANUAL만 노출.
- 패키지 배선: `types`(CashbookEntry/CashbookSummary/CashbookCategory/EntryType/Source/Create·Update payload), `api`(`leader.cashbook.list/summary/create/update/remove`), `hooks`(`useCashbookEntriesQuery`/`useCashbookSummaryQuery`/`useCreate·Update·DeleteCashbookEntryMutation`, mutation onSuccess 시 목록+요약 무효화), `schemas`(`createCashbookEntrySchema` + superRefine: OTHER일 때만 customCategory, entryType↔categoryCode 유효성), 라벨 맵(categoryCode→한글, entryType→수입/지출).
- 금액 입력은 `z.coerce.number().int().positive()`, 날짜는 KST 보정(`todayLocalDate` 패턴), `any`/`as`/`interface` 금지.

## 10. 테스트

- **백엔드(통합, RestAssured + TestContainers)**: 수동 수입/지출 등록(201·저장), 목록 필터(유형·카테고리·기간·검색)·정렬, summary(총수입/총지출/bookBalance, soft-delete 제외, 필터 반영), 카테고리 유효성(INCOME에 MT → 400, OTHER 아닌데 customCategory → 400), MANUAL 전체수정·삭제, **BANK_API 항목 카테고리/메모만 수정(금액 변경 → 400)·삭제 → 409**, BANK 동기화 자동 생성(입금→INCOME·출금→EXPENSE·멱등 재동기화 중복 0), 백필, 권한(비총무 403·타 동아리 격리·존재 비노출).
- **프론트(vitest)**: 장부 목록·요약 렌더, 필터 동작, 등록 다이얼로그(zod 검증·OTHER customCategory 토글), BANK_API 항목 수정 제한(카테고리/메모만)·삭제 버튼 부재. `@duing/hooks` 통째 모킹.

## 11. 빌드 순서 (writing-plans에서 PR 단위 분해)

1. `feat(backend)`: V66(cashbook_entry + CHECK·유니크·RLS·백필) + 엔티티·CashbookCategory enum + 예외 + DTO + `CashbookService`/`GeneralCashbookService`(생성·수정·삭제·조회·요약, 공유 검증) + 컨트롤러/Api + 통합테스트.
2. `feat(backend)`: BANK 동기화 자동 생성 훅(거래 적재 경로에서 cashbook_entry 멱등 생성) + 멱등/입출금 테스트.
3. `feat(frontend)`: 장부 타입·API·훅·스키마·라벨 배선.
4. `feat(frontend)`: "장부" 탭 — 요약·필터·목록·등록/수정 다이얼로그 + 테스트.

## 12. 이후 스프린트 (참고)
- 영수증/증빙 파일 첨부 업로드(FileStorageService), 회원 공개(투명성 조회), 실제 계좌 잔액 병기, 월별·카테고리 통계 차트, CSV/엑셀 내보내기, 예산 대비 집행.

---

## 13. 추가: 항목 집계 제외(excluded) — Sprint 5 확장

### 13.1 배경 / 목표
계좌 거래 중 회계에 잡으면 안 되는 항목(계좌 간 이체·잘못 들어온 입금·본인 충전 등)이 있다. BANK 자동 항목은 **삭제가 안 되므로**(§6), 이를 **집계에서 제외**할 수단이 필요하다. 항목당 **"집계 제외(excluded)" 토글**을 두어, 제외 항목은 **총수입·총지출·장부 잔액에서 빠지되 원본은 보존**하고 목록에는 흐리게 남긴다(필요 시 필터로 가림). 수동·BANK 자동 항목 **둘 다** 토글 가능하다.

### 13.2 데이터 (Flyway V67)
기존 마이그레이션 수정 금지. 최신 V66(이 브랜치) → 신규 **V67**.
```sql
-- 항목 집계 제외 플래그. true 면 총수입·총지출·장부 잔액 집계에서 제외(원본은 보존).
ALTER TABLE cashbook_entry ADD COLUMN excluded BOOLEAN NOT NULL DEFAULT FALSE;
```
`CashbookEntry`에 `boolean excluded`(@Column nullable=false) + `updateExcluded(boolean)` 추가. (메타 플래그이므로 BANK_API·MANUAL 무관하게 토글 가능 — §6의 금액·날짜 불변 규칙과 별개.) 인덱스 불요(소량·기존 idx_cashbook_club_date로 충분).

### 13.3 동작 규칙
- **요약(`/cashbook/summary`)**: **항상 `excluded = false`만 합산**(제외 항목은 어떤 경우에도 집계에서 빠짐). 나머지 필터(유형·카테고리·기간·검색)는 그대로 반영.
- **목록(`/cashbook`)**: 기본은 제외 항목도 **표시**(응답 `excluded=true`로 내려 프론트가 흐리게 + "제외됨" 배지). 신규 필터 `hideExcluded=true` 면 목록에서 `excluded=false`만 반환(가림). 요약은 `hideExcluded`와 무관하게 항상 제외 항목을 빼므로 목록 필터와 독립.
- **토글**: 신규 **`PATCH /api/v1/leader/clubs/{clubId}/cashbook/{entryId}/exclusion`** body `{ "excluded": true/false }` → 204. `requireManager` + 동아리 격리(`findByIdAndClubId`, 아니면 404). 수동·BANK 자동 항목 둘 다 허용. 기존 수정(`PATCH .../{entryId}`)에는 `excluded`를 넣지 않는다(BANK_API 불변 분기와 분리해 단순 유지).

### 13.4 DTO 변경
- `CashbookEntryResponse`에 `excluded`(boolean) 추가.
- `CashbookSearchQuery`에 `hideExcluded`(Boolean, nullable) 추가 — 목록에만 적용. 요약은 `excluded=false`를 항상 강제.
- 신규 `UpdateCashbookExclusionRequest(@NotNull Boolean excluded)` → `toCommand(clubId, actorId, entryId)`. 서비스 `void setExclusion(Long clubId, Long actorId, Long entryId, boolean excluded)`(또는 command) — requireManager + findByIdAndClubId + `entry.updateExcluded(excluded)`.

### 13.5 프론트
- `CashbookEntry` 타입에 `excluded: boolean`, `CashbookSearchParams`에 `hideExcluded?: boolean`.
- `client.leader.cashbook.setExclusion(clubId, entryId, excluded)` → `PATCH .../{entryId}/exclusion`. 훅 `useToggleCashbookExclusionMutation(clubId)`(onSuccess byClub 무효화).
- 장부 목록: 항목별 **"제외 / 복원" 버튼**(현재 excluded면 "복원", 아니면 "제외") → 토글. 제외 항목은 **취소선/회색 + "제외됨" 배지**. 필터 바에 **"제외 항목 숨기기" 토글** → `hideExcluded`.
- 요약 카드는 백엔드가 제외 반영 — 별도 처리 불필요.

### 13.6 테스트
- 백엔드: 수동·BANK 자동 항목 둘 다 제외 토글(204·저장), 제외 항목이 요약(총수입/총지출/bookBalance)에서 빠짐, `hideExcluded` 목록 필터(제외 항목 제외), 응답 `excluded` 필드, 권한/격리(비총무 403·타 동아리 404).
- 프론트: 제외 항목 배지·흐림 표시, 제외/복원 버튼이 토글 mutation 호출, "제외 항목 숨기기" 필터가 `hideExcluded` 파라미터 연결.

### 13.7 빌드 순서 (이 확장)
1. `feat(backend)`: V67 + 엔티티 `excluded`/`updateExcluded` + DTO(`excluded`/`hideExcluded`/`UpdateCashbookExclusionRequest`) + 요약 항상 제외·목록 hideExcluded + 토글 엔드포인트 + 통합테스트.
2. `feat(frontend)`: 타입·client·훅 배선 + 목록 제외/복원 버튼·배지·흐림·"제외 항목 숨기기" 필터 + 테스트.

### 13.8 범위
- **In**: excluded 컬럼(V67)·토글 엔드포인트(양 타입)·요약 항상 제외·목록 hideExcluded 필터·FE 토글/배지/흐림/숨기기 필터.
- **Out**: 제외 사유 기록, 일괄 제외, 복식부기·승인 흐름 — 후속.
