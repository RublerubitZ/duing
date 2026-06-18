# 금전출납부 항목 집계 제외(excluded) 구현 계획 — Sprint 5 확장

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 으로 task 단위 구현. 각 step 은 `- [ ]` 체크박스. **구현 subagent 는 절대 push / PR 생성 / 브랜치 전환을 하지 않는다** — 로컬 커밋까지만.
> 설계서(권위 출처): `docs/superpowers/specs/2026-06-18-cashbook-design.md` §13.

**Goal:** 장부 항목을 집계(총수입·총지출·장부 잔액)에서 제외/복원하는 토글을 추가한다 — 제외 항목은 원본 보존, 목록엔 흐리게 + "제외됨" 배지, "제외 항목 숨기기" 필터로 가림.

**Architecture:** `cashbook_entry`에 `excluded` 플래그(V67). 요약은 항상 `excluded=false`만 합산, 목록은 `hideExcluded` 필터로 선택적 가림. 전용 토글 엔드포인트(수동·BANK 자동 둘 다). 기존 cashbook(`feat/cashbook-sprint5`)과 같은 브랜치에 얹는다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / QueryDSL / RestAssured · Next.js 15 / React 19 / TanStack Query / vitest.

---

## 0. 전제 (현재 코드 기준)
- `CashbookSearchQuery(entryType, categoryCode, from, to, keyword)` — 5필드(keyword). 6번째 `hideExcluded` 추가 예정.
- `CashbookEntryRepositoryImpl.search`/`summarize` — null-safe `BooleanExpression` 헬퍼(clubIdEq/entryTypeEq/categoryEq/dateFrom/dateTo/keyword). 동일 where 조합.
- `CashbookEntryResponse` — 12필드(createdAt 끝). `excluded` 추가.
- `GeneralCashbookService` — create/update/delete/getEntries/getSummary/generateFromBankTransactions + validateCategory/normalizeCustomCategory. `setExclusion` 추가.
- `LeaderCashbookController`/`Api` — 5 엔드포인트. 토글 엔드포인트 추가 + getEntries 에 hideExcluded.
- `LeaderCashbookControllerTest` — 기존 11 테스트 + private `insertBankApiEntry()` 헬퍼(JdbcTemplate raw insert, BANK_API 항목 생성) 존재 → 재사용.
- FE `CashbookEntry`(excluded 추가)·`CashbookSearchParams`(hideExcluded 추가)·`client.leader.cashbook`(setExclusion 추가)·`useToggleCashbookExclusionMutation`·`CashbookPanel`.

## 1. 파일 구조

### Task 1 — BE
- Create: `backend/src/main/resources/db/migration/V67__cashbook_entry_excluded.sql`
- Create: `backend/.../cashbook/controller/dto/request/UpdateCashbookExclusionRequest.java`
- Modify: `cashbook/entity/CashbookEntry.java`(excluded 필드·updateExcluded), `service/dto/query/CashbookSearchQuery.java`(hideExcluded), `controller/dto/response/CashbookEntryResponse.java`(excluded), `repository/CashbookEntryRepositoryImpl.java`(search hideExcluded·summarize 항상 제외), `service/CashbookService.java`+`GeneralCashbookService.java`(setExclusion), `api/LeaderCashbookApi.java`+`controller/LeaderCashbookController.java`(토글 엔드포인트·hideExcluded)
- Test: `backend/.../cashbook/LeaderCashbookControllerTest.java`(케이스 추가)

### Task 2 — FE
- Modify: `frontend/packages/types/src/cashbook.ts`(excluded·hideExcluded), `packages/api/src/client.ts`(setExclusion), `packages/hooks/src/cashbook.ts`+`index.ts`(toggle 훅), `apps/web/.../fees/_components/CashbookPanel.tsx`(제외/복원·배지·흐림·숨기기 필터)
- Test: `apps/web/test/manage/cashbook-panel.test.tsx`(케이스 추가)

### PR
PR1 = Task 1(BE), PR2 = Task 2(FE). cashbook Sprint 5 브랜치에 이어 커밋.

---

# Task 1 — BE 집계 제외(excluded)

**Files:** 위 Task 1 목록.

- [ ] **Step 1: V67 마이그레이션**

`backend/src/main/resources/db/migration/V67__cashbook_entry_excluded.sql`:
```sql
-- 항목 집계 제외 플래그. true 면 총수입·총지출·장부 잔액 집계에서 제외(원본은 보존).
ALTER TABLE cashbook_entry ADD COLUMN excluded BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: 엔티티에 excluded 필드·메서드**

`cashbook/entity/CashbookEntry.java` — `bankTransactionId` 필드 아래에 추가:
```java
    @Column(nullable = false)
    private boolean excluded;
```
그리고 `isBankApi()` 위(또는 아래)에 메서드 추가:
```java
    /** 집계 제외 플래그 설정(true=집계 제외). 메타 정보라 BANK_API·MANUAL 무관하게 변경 가능. */
    public void updateExcluded(boolean excluded) {
        this.excluded = excluded;
    }
```
> `@Builder`/`createManual` 은 변경 불필요(boolean 기본값 false). Lombok `@Getter` → `isExcluded()`. ddl-validate: boolean ↔ `BOOLEAN NOT NULL` 정합.

- [ ] **Step 3: CashbookSearchQuery 에 hideExcluded**

`service/dto/query/CashbookSearchQuery.java` 교체:
```java
package com.duing.domain.cashbook.service.dto.query;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import java.time.LocalDate;

public record CashbookSearchQuery(CashbookEntryType entryType, CashbookCategory categoryCode,
                                  LocalDate from, LocalDate to, String keyword, Boolean hideExcluded) {
}
```

- [ ] **Step 4: CashbookEntryResponse 에 excluded**

`controller/dto/response/CashbookEntryResponse.java` 교체:
```java
package com.duing.domain.cashbook.controller.dto.response;

import com.duing.domain.cashbook.entity.CashbookCategory;
import com.duing.domain.cashbook.entity.CashbookEntry;
import com.duing.domain.cashbook.entity.CashbookEntryType;
import com.duing.domain.cashbook.entity.CashbookSource;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record CashbookEntryResponse(
        Long id, CashbookEntryType entryType, CashbookSource source,
        CashbookCategory categoryCode, String customCategory, Long amount, String description,
        LocalDate transactionDate, String memo, String attachmentUrl, Long bankTransactionId,
        boolean excluded, LocalDateTime createdAt) {

    public static CashbookEntryResponse from(CashbookEntry entry) {
        return new CashbookEntryResponse(entry.getId(), entry.getEntryType(), entry.getSource(),
                entry.getCategoryCode(), entry.getCustomCategory(), entry.getAmount(), entry.getDescription(),
                entry.getTransactionDate(), entry.getMemo(), entry.getAttachmentUrl(),
                entry.getBankTransactionId(), entry.isExcluded(), entry.getCreatedAt());
    }
}
```

- [ ] **Step 5: 리포지토리 — 목록 hideExcluded 필터, 요약 항상 제외**

`repository/CashbookEntryRepositoryImpl.java`:
1. `search` 의 두 where 절(content·count)에 `notExcludedIf(query.hideExcluded())` 를 마지막 인자로 추가:
```java
                .where(clubIdEq(clubId), entryTypeEq(query.entryType()), categoryEq(query.categoryCode()),
                        dateFrom(query.from()), dateTo(query.to()), keyword(query.keyword()),
                        notExcludedIf(query.hideExcluded()))
```
(content·count 둘 다 동일하게.)
2. `summarize` 의 where 절에 `cashbookEntry.excluded.isFalse()` 를 **항상** 추가(요약은 제외 항목을 어떤 경우에도 합산하지 않음):
```java
                .where(clubIdEq(clubId), entryTypeEq(query.entryType()), categoryEq(query.categoryCode()),
                        dateFrom(query.from()), dateTo(query.to()), keyword(query.keyword()),
                        cashbookEntry.excluded.isFalse())
```
3. 헬퍼 추가(다른 private 헬퍼들 사이에):
```java
    // 목록 전용: hideExcluded=true 면 제외 항목을 가린다. 요약은 항상 제외 항목을 빼므로 별도 처리한다.
    private BooleanExpression notExcludedIf(Boolean hideExcluded) {
        return Boolean.TRUE.equals(hideExcluded) ? cashbookEntry.excluded.isFalse() : null;
    }
```

- [ ] **Step 6: 토글 요청 DTO**

`controller/dto/request/UpdateCashbookExclusionRequest.java`:
```java
package com.duing.domain.cashbook.controller.dto.request;

import jakarta.validation.constraints.NotNull;

public record UpdateCashbookExclusionRequest(
        @NotNull(message = "제외 여부는 필수입니다.") Boolean excluded) {
}
```

- [ ] **Step 7: 서비스 setExclusion**

`service/CashbookService.java` — 인터페이스에 메서드 추가:
```java
    void setExclusion(Long clubId, Long actorId, Long entryId, boolean excluded);
```
`service/GeneralCashbookService.java` — `delete` 아래에 구현 추가:
```java
    @Override
    @Transactional
    public void setExclusion(Long clubId, Long actorId, Long entryId, boolean excluded) {
        clubAuthService.requireManager(actorId, clubId);
        CashbookEntry entry = cashbookEntryRepository.findByIdAndClubId(entryId, clubId)
                .orElseThrow(CashbookEntryException.CashbookEntryNotFoundException::new);
        entry.updateExcluded(excluded); // 수동·BANK 자동 둘 다 토글 가능(메타 정보)
    }
```

- [ ] **Step 8: Api 인터페이스 — 토글 엔드포인트 + hideExcluded**

`api/LeaderCashbookApi.java`:
1. `getEntries` 시그니처에 `keyword` 와 `Pageable pageable` 사이에 추가:
```java
            @RequestParam(required = false) Boolean hideExcluded,
```
(+ `@Operation` description 에 "hideExcluded=true 면 제외 항목 숨김" 한 문구 보강.)
2. `delete` 뒤에 토글 엔드포인트 추가:
```java
    @Operation(summary = "장부 항목 집계 제외 토글 (LEADER/OFFICER)",
            description = "항목을 집계(총수입·총지출·장부 잔액)에서 제외하거나 복원한다. 수동·BANK 자동 항목 둘 다 가능.")
    @PatchMapping("/leader/clubs/{clubId}/cashbook/{entryId}/exclusion")
    ResponseEntity<ApiResponse<Void>> setExclusion(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateCashbookExclusionRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
```
import 추가: `com.duing.domain.cashbook.controller.dto.request.UpdateCashbookExclusionRequest`.

- [ ] **Step 9: 컨트롤러 — 토글 핸들러 + hideExcluded 배선**

`controller/LeaderCashbookController.java`:
1. `getEntries` 에 `hideExcluded` 파라미터 추가(`keyword` 와 `Pageable` 사이) + `CashbookSearchQuery` 생성에 반영:
```java
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean hideExcluded,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Page<CashbookEntryResponse> entries = cashbookService.getEntries(
                clubId, currentUser.id(),
                new CashbookSearchQuery(entryType, categoryCode, from, to, keyword, hideExcluded), pageable);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(entries)));
    }
```
2. `getSummary` 의 `CashbookSearchQuery` 생성에 6번째 인자 `null` 추가(요약은 hideExcluded 무관, 항상 제외):
```java
        CashbookSummaryResponse summary = cashbookService.getSummary(
                clubId, currentUser.id(),
                new CashbookSearchQuery(entryType, categoryCode, from, to, keyword, null));
```
3. `delete` 핸들러 뒤에 토글 핸들러 추가(import `UpdateCashbookExclusionRequest`):
```java
    @Override
    public ResponseEntity<ApiResponse<Void>> setExclusion(
            @PathVariable Long clubId,
            @PathVariable Long entryId,
            @Valid @RequestBody UpdateCashbookExclusionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        cashbookService.setExclusion(clubId, currentUser.id(), entryId, request.excluded());
        return ResponseEntity.noContent().build();
    }
```

- [ ] **Step 10: 통합테스트 추가**

`backend/src/test/java/com/duing/domain/cashbook/LeaderCashbookControllerTest.java` — 기존 클래스에 케이스 추가(기존 `CashbookEntryFixture`·`insertBankApiEntry()` 헬퍼·`leaderToken`/`memberToken`/`clubId`/`otherClubId` 재사용):
```java
    @Test
    @DisplayName("수동 항목을 집계에서 제외하면 요약(총수입)에서 빠진다")
    void excludeManualEntryDropsFromSummary() {
        CashbookEntry kept = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 100000L, LocalDate.of(2026, 9, 1)));
        CashbookEntry excluded = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.SPONSOR, 50000L, LocalDate.of(2026, 9, 2)));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + excluded.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(cashbookEntryRepository.findById(excluded.getId()).orElseThrow().isExcluded()).isTrue();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook/summary")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.totalIncome", equalTo(100000)); // kept 만 합산, excluded 제외
        // 보존 확인: 제외해도 항목 자체는 남는다
        assertThat(cashbookEntryRepository.findById(kept.getId())).isPresent();
    }

    @Test
    @DisplayName("BANK 자동 항목도 집계에서 제외할 수 있다")
    void excludeBankApiEntry() {
        Long bankEntryId = insertBankApiEntry();

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + bankEntryId + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        assertThat(cashbookEntryRepository.findById(bankEntryId).orElseThrow().isExcluded()).isTrue();
    }

    @Test
    @DisplayName("hideExcluded=true 면 목록에서 제외 항목이 빠진다")
    void listHidesExcluded() {
        cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 100000L, LocalDate.of(2026, 9, 1)));
        CashbookEntry excluded = cashbookEntryRepository.save(
                CashbookEntryFixture.manualExpense(clubId, CashbookCategory.MT, 30000L, LocalDate.of(2026, 9, 2)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + excluded.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NO_CONTENT.value());

        // 기본(필터 없음): 2건, excluded 필드 노출
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(2));
        // hideExcluded=true: 1건
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .queryParam("hideExcluded", true)
                .when().get("/api/v1/leader/clubs/" + clubId + "/cashbook")
                .then().statusCode(HttpStatus.OK.value())
                .body("data.content", hasSize(1))
                .body("data.content[0].excluded", equalTo(false));
    }

    @Test
    @DisplayName("타 동아리 항목 제외 토글은 404, 비총무는 403")
    void exclusionIsolation() {
        CashbookEntry otherEntry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(otherClubId, CashbookCategory.FEE, 1000L, LocalDate.of(2026, 9, 1)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + otherEntry.getId() + "/exclusion")
                .then().statusCode(HttpStatus.NOT_FOUND.value());

        CashbookEntry ourEntry = cashbookEntryRepository.save(
                CashbookEntryFixture.manualIncome(clubId, CashbookCategory.FEE, 1000L, LocalDate.of(2026, 9, 1)));
        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + memberToken)
                .contentType(ContentType.JSON)
                .body(Map.of("excluded", true))
                .when().patch("/api/v1/leader/clubs/" + clubId + "/cashbook/" + ourEntry.getId() + "/exclusion")
                .then().statusCode(HttpStatus.FORBIDDEN.value());
    }
```
> `assertThat`/`equalTo`/`hasSize` static import 는 기존 테스트에 이미 있다. 없으면 추가(`org.hamcrest.Matchers.hasSize`).

- [ ] **Step 11: 테스트 실행 → 통과**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.cashbook.LeaderCashbookControllerTest"`
Expected: 기존 + 신규 4 케이스 전부 PASS(V67 Flyway 적용 + ddl validate 정합 — excluded 컬럼↔boolean). Docker 필요.

- [ ] **Step 12: 커밋**

```bash
git add backend/src/main/resources/db/migration/V67__cashbook_entry_excluded.sql backend/src/main/java/com/duing/domain/cashbook backend/src/test/java/com/duing/domain/cashbook
git commit -m "feat(backend): 금전출납부 항목 집계 제외(excluded) 토글·필터 추가"
```

---

# Task 2 — FE 집계 제외(excluded)

**Files:** 위 Task 2 목록.

- [ ] **Step 1: 타입 — excluded·hideExcluded**

`frontend/packages/types/src/cashbook.ts`:
1. `CashbookEntry` 에 `excluded` 추가(`createdAt` 위 또는 적당한 위치):
```typescript
export type CashbookEntry = {
  id: number;
  entryType: CashbookEntryType;
  source: CashbookSource;
  categoryCode: CashbookCategory;
  customCategory: string | null;
  amount: number;
  description: string;
  transactionDate: string;
  memo: string | null;
  attachmentUrl: string | null;
  bankTransactionId: number | null;
  excluded: boolean;
  createdAt: string;
};
```
2. `CashbookSearchParams` 에 `hideExcluded` 추가:
```typescript
export type CashbookSearchParams = {
  entryType?: CashbookEntryType;
  categoryCode?: CashbookCategory;
  from?: string;
  to?: string;
  keyword?: string;
  hideExcluded?: boolean;
  page?: number;
  size?: number;
};
```

- [ ] **Step 2: API 클라이언트 — setExclusion**

`frontend/packages/api/src/client.ts`:
1. `leader.cashbook` 타입 선언(`remove` 뒤)에 추가:
```typescript
      setExclusion(clubId: number, entryId: number, excluded: boolean): Promise<void>;
```
2. `leader.cashbook` 구현(`remove` 구현 뒤)에 추가:
```typescript
        setExclusion: (clubId, entryId, excluded) =>
          jsonVoid(http.patch(`leader/clubs/${clubId}/cashbook/${entryId}/exclusion`, { json: { excluded } })),
```
(정확한 위치는 기존 cashbook 블록을 Read 로 확인. `jsonVoid`·상대경로 컨벤션 재사용.)

- [ ] **Step 3: 훅 — useToggleCashbookExclusionMutation**

`frontend/packages/hooks/src/cashbook.ts` — `useDeleteCashbookEntryMutation` 아래에 추가:
```typescript
export function useToggleCashbookExclusionMutation(clubId: number) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, excluded }: { entryId: number; excluded: boolean }) =>
      client.leader.cashbook.setExclusion(clubId, entryId, excluded),
    // 제외/복원은 목록·요약 모두 바꾸므로 동아리 prefix 전체 무효화.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cashbookQueryKeys.byClub(clubId) }),
  });
}
```
`frontend/packages/hooks/src/index.ts` — cashbook 훅 export 블록에 `useToggleCashbookExclusionMutation,` 추가.

- [ ] **Step 4: CashbookPanel — 제외/복원 버튼·배지·흐림·숨기기 필터**

`frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/CashbookPanel.tsx`:
1. import 에 `useToggleCashbookExclusionMutation` 추가:
```typescript
import {
  useCashbookEntriesQuery,
  useCashbookSummaryQuery,
  useDeleteCashbookEntryMutation,
  useToggleCashbookExclusionMutation,
} from '@duing/hooks';
```
2. 상태 추가(`keyword` state 아래):
```typescript
  const [hideExcluded, setHideExcluded] = useState(false);
```
3. `params` useMemo 에 추가 + deps 반영:
```typescript
      ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
      ...(hideExcluded ? { hideExcluded: true } : {}),
      page: 0,
      size: PAGE_SIZE,
    }),
    [typeFilter, categoryFilter, fromDate, toDate, keyword, hideExcluded],
```
4. 훅·핸들러 추가(`deleteEntry` 아래):
```typescript
  const toggleExclusion = useToggleCashbookExclusionMutation(clubId);

  const onToggleExclusion = (entry: CashbookEntry) => {
    toggleExclusion.mutate(
      { entryId: entry.id, excluded: !entry.excluded },
      {
        onSuccess: () => addToast(entry.excluded ? '집계에 다시 포함했습니다.' : '집계에서 제외했습니다.'),
        onError: (error) =>
          addToast(error instanceof Error ? error.message : '처리에 실패했습니다.', { variant: 'error' }),
      },
    );
  };
```
5. 필터 바에 "제외 항목 숨기기" 토글 버튼 추가(type 토글 버튼 map 닫힌 뒤, 카테고리 select 앞):
```tsx
        <button
          type="button"
          onClick={() => setHideExcluded((current) => !current)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
            hideExcluded ? 'border-ink bg-ink text-paper' : 'border-line text-charcoal-2 hover:bg-graysoft',
          )}
        >
          제외 항목 숨기기
        </button>
```
6. 목록 `<li>` 를 제외 항목 흐림 + 배지 + 제외/복원 버튼으로 교체:
```tsx
            <li
              key={entry.id}
              className={cn(
                'flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3',
                entry.excluded && 'opacity-60',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {entry.description}
                  <span className="ml-1.5 text-xs font-normal text-charcoal-3">
                    {cashbookCategoryLabel(entry.categoryCode, entry.customCategory)}
                  </span>
                  {entry.source === 'BANK_API' && (
                    <span className="ml-1.5 rounded bg-graysoft px-1.5 py-0.5 text-[10px] text-charcoal-3">자동</span>
                  )}
                  {entry.excluded && (
                    <span className="ml-1.5 rounded bg-coral/10 px-1.5 py-0.5 text-[10px] text-coral">제외됨</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-charcoal-3">{entry.transactionDate}{entry.memo ? ` · ${entry.memo}` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={cn(
                    'text-sm font-bold',
                    entry.entryType === 'INCOME' ? 'text-sage' : 'text-coral',
                    entry.excluded && 'line-through',
                  )}
                >
                  {entry.entryType === 'INCOME' ? '+' : '−'}{formatWon(entry.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleExclusion(entry)}
                  disabled={toggleExclusion.isPending}
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
                >
                  {entry.excluded ? '복원' : '제외'}
                </button>
                <button type="button" onClick={() => setEditTarget(entry)} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft">수정</button>
                {entry.source === 'MANUAL' && (
                  <button type="button" onClick={() => onDelete(entry)} disabled={deleteEntry.isPending} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50">삭제</button>
                )}
              </div>
            </li>
```

- [ ] **Step 5: 패널 테스트 추가**

`frontend/apps/web/test/manage/cashbook-panel.test.tsx`:
1. `@duing/hooks` 모킹에 `useToggleCashbookExclusionMutation` 추가, 그 mutate 를 캡처:
```tsx
const mockToggleMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCashbookEntriesQuery: (clubId: number, params: unknown) => mockUseEntries(clubId, params),
  useCashbookSummaryQuery: (clubId: number, params: unknown) => mockUseSummary(clubId, params),
  useDeleteCashbookEntryMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleCashbookExclusionMutation: () => ({ mutate: mockToggleMutate, isPending: false }),
}));
```
2. `buildEntry` 빌더에 `excluded: false` 기본값 추가(타입 필수 필드):
```tsx
const buildEntry = (over: Partial<CashbookEntry> = {}): CashbookEntry => ({
  id: 1, entryType: 'EXPENSE', source: 'BANK_API', categoryCode: 'OTHER', customCategory: null,
  amount: 30000, description: '출금', transactionDate: '2026-09-03', memo: null,
  attachmentUrl: null, bankTransactionId: 9, excluded: false, createdAt: '2026-09-03T00:00:00', ...over,
});
```
3. 신규 케이스 3개(기존 import 에 `fireEvent` 없으면 `@testing-library/react` 에서 추가):
```tsx
  it('제외된 항목은 "제외됨" 배지로 표시된다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry({ excluded: true })]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 0, bookBalance: 0 } });
    render(<CashbookPanel clubId={1} />);
    expect(screen.getByText('제외됨')).toBeInTheDocument();
  });

  it('제외 버튼이 토글 mutation 을 호출한다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry({ excluded: false })]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 30000, bookBalance: -30000 } });
    render(<CashbookPanel clubId={1} />);
    fireEvent.click(screen.getByRole('button', { name: '제외' }));
    expect(mockToggleMutate).toHaveBeenCalledWith(
      { entryId: 1, excluded: true },
      expect.anything(),
    );
  });

  it('"제외 항목 숨기기" 토글이 hideExcluded 파라미터를 연결한다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 0, bookBalance: 0 } });
    render(<CashbookPanel clubId={1} />);
    fireEvent.click(screen.getByRole('button', { name: '제외 항목 숨기기' }));
    const lastParams = mockUseEntries.mock.calls.at(-1)?.[1];
    expect(lastParams).toMatchObject({ hideExcluded: true });
  });
```

- [ ] **Step 6: 테스트·타입체크 → 통과 + 커밋**

Run: `cd frontend && pnpm -C apps/web test -- --run cashbook && pnpm -C apps/web typecheck`
Expected: 테스트 PASS, 타입 에러 0.
```bash
git add frontend/packages frontend/apps/web
git commit -m "feat(frontend): 금전출납부 항목 제외/복원 토글·배지·숨기기 필터 추가"
```

---

## 2. 자기 검토 (Self-Review)

**Spec coverage** — 설계서 §13 매핑:
- §13.2 V67·excluded·updateExcluded → T1 Step1·2. §13.3 요약 항상 제외(summarize `excluded.isFalse()`)·목록 hideExcluded(notExcludedIf)·토글 엔드포인트 → T1 Step5·8·9. §13.4 DTO(`CashbookEntryResponse.excluded`·`CashbookSearchQuery.hideExcluded`·`UpdateCashbookExclusionRequest`·`setExclusion`) → T1 Step3·4·6·7. §13.5 FE(타입·client·훅·제외/복원·배지·흐림·숨기기 필터) → T2. §13.6 테스트 → T1 Step10·T2 Step5.

**Placeholder scan**: 전 step 실제 코드/명령. "Read 로 확인"(client.ts cashbook 블록 위치)은 정합 확인 지시.

**Type consistency**: BE `CashbookEntryResponse.excluded`(boolean) ↔ FE `CashbookEntry.excluded`(boolean). `CashbookSearchQuery` 6필드(hideExcluded Boolean) ↔ 컨트롤러 두 생성처(getEntries=hideExcluded, getSummary=null) 일치 ↔ FE `CashbookSearchParams.hideExcluded`. `setExclusion(Long,Long,Long,boolean)` 인터페이스·구현·컨트롤러 일치. `useToggleCashbookExclusionMutation` 훅·index·panel·test 일치. 요약은 항상 `excluded.isFalse()`(hideExcluded 무관), 목록은 `notExcludedIf`(hideExcluded일 때만) — §13.3 규칙과 일치.

---

## 3. 실행 핸드오프

Plan 저장 완료. 실행은 **Subagent-Driven**(권장) — Task 1~2 순차 구현, task마다 spec + duing-code-reviewer 리뷰(Migration·API contract·데이터무결성 영역이라 adversarial 추가), 구현 subagent push/PR 금지. PR 2개(BE/FE)로 분리 가능.
