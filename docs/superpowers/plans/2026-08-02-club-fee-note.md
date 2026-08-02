# 동아리 회비 안내문(feeNote) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 동아리 회비에 선택 안내문(최대 300자, 줄바꿈 유지)을 추가 — 관리 폼에서 입력하고 상세 페이지에서 대표 회비와 함께(또는 단독으로) 노출한다.

**Architecture:** BE에 nullable `fee_note VARCHAR(300)` 컬럼 1개를 추가하고 기존 부분갱신 파이프라인(요청→커맨드→페이로드→엔티티, 응답은 엔티티→쿼리→응답)에 스레딩한다. 기존 회비 pair(`feeCycle`/`membershipFeeAmount`)와 그 pair-atomic 검증(`isFeePairConsistent`, `feePairRule`)은 일절 건드리지 않는다 — feeNote는 tagline과 같은 독립 텍스트 필드다.

**Tech Stack:** Spring Boot 3.4 / Flyway / RestAssured 통합테스트 · Next.js 15 / zod / vitest + testing-library

**스펙:** `docs/superpowers/specs/2026-08-02-club-fee-note-design.md`

## Global Constraints

- 사용자 대면 메시지(검증 메시지·라벨·placeholder)는 전부 한글
- 커밋 메시지에 Co-Authored-By / 🤖 Generated 라인 절대 금지
- 백엔드 테스트는 `backend/` cwd에서 `./gradlew test --tests ...` (Docker 필요), 프론트는 `frontend/` cwd에서 pnpm 스크립트. `| tail` 등으로 exit code 가리지 말 것
- `Club.UpdatePayload`/`UpdateClubCommand`는 **positional record** — 컴포넌트 추가 시 모든 생성 지점의 인자 순서·개수를 함께 맞춘다 (feeNote는 항상 **마지막(26번째)** 에 추가)
- 텍스트 비우기 규약: FE는 `""` 전송 → BE `blankToNull`로 null 저장 (기존 tagline/location과 동일)
- FE: `any`/`as` 금지, 타입은 `type`, 검증 메시지 BE와 동일 문구
- 각 Task는 TDD: 실패 테스트 먼저 → 구현 → 통과 확인 → 커밋
- 구현 subagent는 push·PR 생성 금지 (오케스트레이터가 리뷰 후 수행)

---

### Task 1: 백엔드 — fee_note 컬럼 + 수정/상세 API 필드

**Files:**
- Create: `backend/src/main/resources/db/migration/V96__add_club_fee_note.sql`
- Modify: `backend/src/main/java/com/duing/domain/club/entity/Club.java` (필드 ~L125 뒤, UpdatePayload L272-298, update() L300-343)
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/UpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/request/AdminUpdateClubRequest.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/command/UpdateClubCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/club/service/dto/query/ClubDetailQuery.java`
- Modify: `backend/src/main/java/com/duing/domain/club/controller/dto/response/ClubDetailResponse.java`
- Test: `backend/src/test/java/com/duing/domain/club/entity/ClubProfileUpdateTest.java`
- Test: `backend/src/test/java/com/duing/domain/club/controller/ClubUpdateControllerTest.java`
- Test: `backend/src/test/java/com/duing/domain/club/controller/AdminClubUpdateControllerTest.java`

**Interfaces:**
- Produces: PATCH `/api/v1/clubs/{id}` · `/api/v1/admin/clubs/{id}` 요청/응답에 `feeNote: String|null` (최대 300자, `""`=클리어, null/미포함=미변경). Task 2·3의 FE가 이 계약에 의존.

- [ ] **Step 1: 실패하는 엔티티 테스트 작성**

`ClubProfileUpdateTest.java`에 테스트와 헬퍼 추가. 기존 헬퍼 3개(`emptyPayload`, `payloadWithFee`, `payloadWithSns`)는 마지막 인자에 `null` 1개씩 추가해 26개로 맞춘다 (헬퍼 주석의 "25개 인자"도 26으로 수정).

```java
@Test
@DisplayName("회비 안내문은 납부 주기와 독립적으로 저장되고, null 은 미변경, 빈 문자열은 null 로 클리어된다")
void feeNoteIndependentAndBlankCleared() {
    Club club = createClub();
    club.update(payloadWithFeeNote("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원"));
    assertThat(club.getFeeNote()).isEqualTo("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원");
    assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE); // 주기는 건드리지 않는다

    club.update(payloadWithFeeNote(null)); // null = 미변경
    assertThat(club.getFeeNote()).isEqualTo("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원");

    club.update(payloadWithFeeNote("")); // "" = 클리어
    assertThat(club.getFeeNote()).isNull();
}

private Club.UpdatePayload payloadWithFeeNote(String feeNote) {
    return new Club.UpdatePayload(
            null, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, feeNote);
}
```

- [ ] **Step 2: 실패하는 컨트롤러 테스트 작성**

`ClubUpdateControllerTest.java`에 추가 (`nullValue` import는 이미 있음):

```java
@Test
@DisplayName("회비 안내문 300자는 저장되고 상세 응답에 포함된다")
void feeNoteAtLimitIsSaved() {
    String maxLengthNote = "가".repeat(300);
    RestAssured
            .given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeNote", maxLengthNote))
            .when()
                .patch("/api/v1/clubs/{clubId}", club.getId())
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.feeNote", equalTo(maxLengthNote));

    Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
    assertThat(reloaded.getFeeNote()).isEqualTo(maxLengthNote);
}

@Test
@DisplayName("회비 안내문이 301자면 400 을 반환한다")
void feeNoteOverLimitReturns400() {
    RestAssured
            .given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeNote", "가".repeat(301)))
            .when()
                .patch("/api/v1/clubs/{clubId}", club.getId())
            .then()
                .statusCode(HttpStatus.BAD_REQUEST.value());
}

@Test
@DisplayName("회비 안내문에 빈 문자열을 보내면 저장된 안내문이 비워진다")
void emptyFeeNoteClearsStoredValue() {
    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .contentType(ContentType.JSON)
            .body(Map.of("feeNote", "선수 : 학기당 30,000원"))
            .when().patch("/api/v1/clubs/{clubId}", club.getId())
            .then().statusCode(HttpStatus.OK.value());

    RestAssured.given()
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
            .contentType(ContentType.JSON)
            .body(Map.of("feeNote", ""))
            .when().patch("/api/v1/clubs/{clubId}", club.getId())
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.feeNote", nullValue());

    Club reloaded = clubRepository.findById(club.getId()).orElseThrow();
    assertThat(reloaded.getFeeNote()).isNull();
}
```

`AdminClubUpdateControllerTest.java`에 추가 (admin 경로 toCommand 스레딩 검증 — positional 인자 오배치를 잡는 테스트):

```java
@Test
@DisplayName("총동연이 회비 안내문을 수정하면 상세 응답에 반영된다")
void adminUpdatesFeeNote() {
    RestAssured
            .given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                .contentType(ContentType.JSON)
                .body(Map.of("feeNote", "신규회원: 20,000원 / 기존회원: 15,000원"))
            .when()
                .patch("/api/v1/admin/clubs/{clubId}", club.getId())
            .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.feeNote", equalTo("신규회원: 20,000원 / 기존회원: 15,000원"));
}
```

(이 파일의 기존 setUp/필드명은 파일을 읽고 그대로 따를 것 — `equalTo` import 유무 확인.)

- [ ] **Step 3: 컴파일 실패 확인**

Run (cwd `backend/`): `./gradlew compileTestJava`
Expected: FAIL — `getFeeNote()` 심볼 없음 / UpdatePayload 인자 개수 불일치

- [ ] **Step 4: 마이그레이션 작성**

`V96__add_club_fee_note.sql` (새 파일 — 기존 마이그레이션 수정 금지):

```sql
-- 회비 안내문: 모집 분야별/신규·기존 회원별 회비 차등 등을 자유 텍스트로 안내 (스펙 2026-08-02-club-fee-note)
ALTER TABLE club ADD COLUMN fee_note VARCHAR(300);
COMMENT ON COLUMN club.fee_note IS '회비 안내문';
```

- [ ] **Step 5: 엔티티 구현**

`Club.java` — `feeCycle` 필드 선언(L123-125) 바로 아래에:

```java
/** 회비 안내문 — 분야별/신규·기존 차등 등 자유 텍스트. 대표 회비(feeCycle/금액)와 독립. */
@Column(name = "fee_note", length = 300)
private String feeNote;
```

`UpdatePayload` record — `useGeneration` 뒤 마지막(26번째) 컴포넌트로 추가:

```java
            Boolean useGeneration,               // 25
            String feeNote                       // 26
    ) {}
```

`update()` — `useGeneration` 처리 라인 뒤에:

```java
        if (payload.feeNote() != null) this.feeNote = blankToNull(payload.feeNote());
```

- [ ] **Step 6: 요청 DTO 2개 + 커맨드 스레딩**

`UpdateClubRequest.java` — `membershipFeeAmount` 컴포넌트 뒤에 선언 추가:

```java
        @Size(max = 300, message = "회비 안내는 300자 이하여야 합니다.")
        String feeNote,
```

`toCommand()`의 `new UpdateClubCommand(...)` 마지막 인자(`useGeneration` 뒤)에 `feeNote` 추가.

`AdminUpdateClubRequest.java` — 동일하게 선언 추가, `toCommand()`는 `null /* useGeneration */` 뒤에 `feeNote` 추가.

`UpdateClubCommand.java` — `useGeneration` 뒤 마지막 컴포넌트로 `String feeNote` 추가, `toPayload()` 마지막 인자에 `feeNote()` 추가.

- [ ] **Step 7: 응답 스레딩**

`ClubDetailQuery.java` — record에 `String feeNote` 추가(위치: `feeCycle` 뒤 권장 — **이 record는 명시적 위치이므로 of() 팩토리의 인자 순서를 반드시 같은 위치에 맞춘다**: `club.getFeeCycle(),` 뒤에 `club.getFeeNote(),`).

`ClubDetailResponse.java` — 동일 위치(`feeCycle` 뒤)에 `String feeNote` 추가, `from()`에 `detailQuery.feeNote(),` 를 같은 위치에 추가.

- [ ] **Step 8: 테스트 실행**

Run (cwd `backend/`): `./gradlew test --tests '*ClubProfileUpdateTest' --tests '*ClubUpdateControllerTest' --tests '*AdminClubUpdateControllerTest'`
Expected: 전부 PASS, 출력에서 BUILD SUCCESSFUL 확인 (Docker 필요)

- [ ] **Step 9: 커밋**

```bash
git add backend/
git commit -m "feat(backend): 동아리 회비 안내문(feeNote) — fee_note 컬럼·수정/상세 API 필드 추가"
```

---

### Task 2: 프론트 — 타입·스키마·관리 폼 입력 + 미리보기

**Files:**
- Modify: `frontend/packages/types/src/club.ts` (ClubDetail L86-113, UpdateClubPayload L179-201)
- Modify: `frontend/packages/schemas/src/index.ts` (clubProfileBaseSchema L300-335)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ClubProfilePreview.tsx`
- Test: `frontend/apps/web/test/manage/club-info-form.test.tsx`
- Test(픽스처만): `ClubDetail` 리터럴을 만드는 모든 테스트 파일 — typecheck가 잡아주는 대로 `feeNote: null` 추가

**Interfaces:**
- Consumes: Task 1의 API 계약 (`feeNote?: string | null`, `""`=클리어)
- Produces: `ClubDetail.feeNote: string | null` / `UpdateClubPayload.feeNote?: string | null` / `ClubPreviewData.feeNote: string` — Task 3이 `ClubDetail.feeNote`에 의존

- [ ] **Step 1: 실패하는 폼 테스트 작성**

`club-info-form.test.tsx` — `makeDetail` 픽스처에 `feeNote: null,` 추가 후 테스트 3개 추가:

```tsx
it('회비 안내를 입력하면 페이로드에 feeNote 로 담긴다', async () => {
  const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
  render(
    <ClubInfoForm detail={makeDetail()} mode="leader" mutation={{ mutateAsync, isPending: false }} />,
  );
  fireEvent.change(screen.getByLabelText('회비 안내 (선택)'), {
    target: { value: '선수 : 학기당 30,000원' },
  });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  expect(mutateAsync).toHaveBeenCalledWith({ feeNote: '선수 : 학기당 30,000원' });
});

it('저장된 회비 안내를 지우면 빈 문자열이 전송된다(클리어 규약)', async () => {
  const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
  render(
    <ClubInfoForm
      detail={makeDetail({ feeNote: '기존 안내' })}
      mode="leader"
      mutation={{ mutateAsync, isPending: false }}
    />,
  );
  fireEvent.change(screen.getByLabelText('회비 안내 (선택)'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  expect(mutateAsync).toHaveBeenCalledWith({ feeNote: '' });
});

it('회비 안내를 건드리지 않으면 페이로드에 feeNote 가 담기지 않는다', async () => {
  const mutateAsync = vi.fn().mockResolvedValue(makeDetail());
  render(
    <ClubInfoForm
      detail={makeDetail({ feeNote: '기존 안내' })}
      mode="leader"
      mutation={{ mutateAsync, isPending: false }}
    />,
  );
  fireEvent.change(screen.getByLabelText('한줄 소개'), { target: { value: '새 소개' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));

  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  const payload: AdminUpdateClubPayload = mutateAsync.mock.calls[0]?.[0] ?? {};
  expect(payload).toHaveProperty('tagline', '새 소개');
  expect(payload).not.toHaveProperty('feeNote');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `frontend/`): `pnpm --filter web test -- club-info-form`
Expected: FAIL — `feeNote` 타입 없음(typecheck) 또는 '회비 안내 (선택)' 라벨 없음

- [ ] **Step 3: 타입·스키마 추가**

`packages/types/src/club.ts`:
- `ClubDetail`의 `feeCycle: FeeCycle;` 아래에 `feeNote: string | null;`
- `UpdateClubPayload`의 `feeCycle?: FeeCycle;` 아래에 `feeNote?: string | null;` (Admin payload는 교차 타입이라 자동 상속)

`packages/schemas/src/index.ts` — `clubProfileBaseSchema`의 `membershipFeeAmount` 아래에:

```ts
  // 회비 안내문 — 대표 회비(주기/금액)와 독립, feePairRule 무관.
  feeNote: z.string().max(300, '회비 안내는 300자 이하여야 합니다.').nullable().optional(),
```

- [ ] **Step 4: ClubInfoForm 구현**

state (L139-141 `feeAmount` 아래):

```ts
const [feeNote, setFeeNote] = useState(detail.feeNote ?? '');
```

`buildPayload()` — 회비 쌍 블록(L200-204) 뒤에:

```ts
    // 회비 안내문은 주기/금액 쌍과 독립 — 비우기는 '' 전송(BE blankToNull) (§clear-intent)
    if (feeNote !== (detail.feeNote ?? '')) payload.feeNote = feeNote;
```

`handleSubmit`의 `baseData`(L229-248) — `membershipFeeAmount` 아래에 `feeNote: feeNote || null,`

`preview` 객체(L272-286) — `membershipFeeAmount` 아래에 `feeNote,`

UI — SectionCard 3의 `<Field label="회비">…</Field>`를 감싼 `<div className="mt-4">` 안, `</Field>` **바깥이 아니라 Field 뒤 형제**로 두면 라벨 중첩 위험이 있으니 실제 `Field` 컴포넌트 구현을 열어 label 요소로 children을 감싸는지 확인할 것. 감싸지 않으면(단순 div+span 구조) Field 내부 마지막에, 감싼다면 Field 밖 형제 div로 배치:

```tsx
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="f-fee-note" className={labelCls}>회비 안내 (선택)</label>
                  <span className="text-[11.5px] font-medium text-[#8a8f83]">{feeNote.length}/300</span>
                </div>
                <textarea
                  id="f-fee-note"
                  value={feeNote}
                  maxLength={300}
                  rows={4}
                  onChange={(event) => setFeeNote(event.target.value)}
                  placeholder={'선수 : 학기당 30,000원\n매니저 : 학기당 15,000원\n\n신규 회원은 첫 학기만 5,000원이 추가됩니다.'}
                  className="w-full resize-none rounded-[8px] border border-[#cfcab8] bg-white px-3 py-2 text-[14px] leading-relaxed focus:border-[#4a6b3f] focus:outline-none"
                />
                <p className="text-[12px] text-[#8a8f83]">
                  모집 분야별 또는 신규/기존 회원 등 회비가 다른 경우 자유롭게 안내해 주세요.
                </p>
              </div>
```

(readOnly는 상위 `<fieldset disabled>`가 처리 — 별도 disabled 불필요. `feeCycle !== 'NONE'` 조건 **밖**에 두어 회비 없음이어도 항상 입력 가능하게 한다.)

- [ ] **Step 5: ClubProfilePreview 반영**

`ClubPreviewData`에 `feeNote: string;` 추가 (`membershipFeeAmount` 아래). `metaItems` 회비 라인(L36) 교체:

```ts
  // 대표 금액이 있으면 그대로, 없어도 안내문이 있으면 안내문으로 회비 셀 노출(한 줄 truncate) — 상세 페이지 노출 규칙과 동일 조건
  if (feeText !== null) metaItems.push(['회비', feeText]);
  else if (preview.feeNote !== '') metaItems.push(['회비', preview.feeNote]);
```

- [ ] **Step 6: typecheck 로 픽스처 전수 수정**

Run (cwd `frontend/`): `pnpm typecheck`
`ClubDetail` 리터럴을 만드는 모든 테스트/목 파일에 `feeNote: null,` 추가 (예: `apps/web/test/clubs/club-detail-info-list.test.tsx`의 `baseClub`, `club-detail-tabs.test.tsx`, `club-detail-page.test.tsx`, `club-detail-stats.test.tsx` 등 — typecheck 에러가 0이 될 때까지).
Expected: PASS

- [ ] **Step 7: 테스트 실행**

Run (cwd `frontend/`): `pnpm --filter web test -- club-info-form`
Expected: 신규 3개 포함 전부 PASS

- [ ] **Step 8: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 동아리 정보 관리 폼 회비 안내 입력 — 300자 textarea·미리보기 반영"
```

---

### Task 3: 프론트 — 상세 페이지 회비 안내 노출

**Files:**
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailInfoList.tsx`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailTabs.tsx` (hasInfo L34-39)
- Test: `frontend/apps/web/test/clubs/club-detail-info-list.test.tsx`
- Test: `frontend/apps/web/test/clubs/club-detail-tabs.test.tsx`

**Interfaces:**
- Consumes: `ClubDetail.feeNote: string | null` (Task 2), `formatClubFee(feeCycle, amount): string | null` (기존)

- [ ] **Step 1: 실패하는 테스트 작성**

`club-detail-info-list.test.tsx`의 "ClubDetailInfoList — 회비" describe에 추가 (`baseClub`에는 Task 2에서 `feeNote: null` 이 이미 추가된 상태):

```tsx
  it('회비 안내가 있으면 대표 회비 아래에 줄바꿈·긴 문자열 줄바꿈이 유지된 안내문을 표시한다', () => {
    render(
      <ClubDetailInfoList
        club={{
          ...baseClub,
          feeCycle: 'SEMESTER',
          membershipFeeAmount: 30000,
          feeNote: '선수 : 학기당 30,000원\n매니저 : 학기당 15,000원',
        }}
      />,
    );

    expect(screen.getByText('학기당 30,000원')).toBeInTheDocument();
    const note = screen.getByText(/매니저 : 학기당 15,000원/);
    expect(note).toHaveClass('whitespace-pre-wrap', 'break-words');
  });

  it('회비 NONE 이어도 안내문이 있으면 회비 항목에 안내문만 표시한다', () => {
    render(
      <ClubDetailInfoList
        club={{ ...baseClub, feeNote: '신규회원: 20,000원 / 기존회원: 15,000원' }}
      />,
    );

    expect(screen.getByText('회비')).toBeInTheDocument();
    expect(screen.getByText(/신규회원: 20,000원/)).toBeInTheDocument();
  });
```

(기존 "회비 NONE 은 회비 항목을 표시하지 않는다" 테스트는 feeNote:null 기본값으로 그대로 유효 — 삭제 금지.)

`club-detail-tabs.test.tsx` — 해당 파일의 기존 픽스처 idiom을 따라 추가:

```tsx
  it('다른 상세정보가 없어도 회비 안내문이 있으면 동아리 상세정보 탭이 노출된다', () => {
    // 픽스처는 이 파일의 기존 base 클럽 헬퍼를 사용하고 feeNote 만 채운다
    render(<ClubDetailTabs club={{ ...baseClub, feeNote: '신규회원 안내' }} photos={[]} />);
    expect(screen.getByRole('tab', { name: '동아리 상세정보' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run (cwd `frontend/`): `pnpm --filter web test -- club-detail-info-list club-detail-tabs`
Expected: 신규 테스트 FAIL (회비 항목 미노출)

- [ ] **Step 3: ClubDetailInfoList 구현**

```tsx
type Row = { label: string; value: string | null; note?: string | null };
```

회비 push(L14-15) 교체:

```tsx
  const feeText = formatClubFee(club.feeCycle, club.membershipFeeAmount);
  // 대표 금액이 없어도 안내문이 있으면 회비 항목을 노출한다 (스펙 결정 사항)
  if (feeText !== null || club.feeNote !== null) {
    rows.push({ label: '회비', value: feeText, note: club.feeNote });
  }
```

나머지 push는 `value`만 쓰므로 그대로 두고, `<dd>` 렌더 교체:

```tsx
          <dd className="text-charcoal">
            {row.value}
            {row.note != null && (
              <p
                className={`${row.value !== null ? 'mt-1 ' : ''}whitespace-pre-wrap break-words text-[13px] leading-relaxed text-charcoal-3`}
              >
                {row.note}
              </p>
            )}
          </dd>
```

(`row.value`가 null이면 React가 아무것도 렌더하지 않아 빈 공간 없이 안내문만 남는다.)

- [ ] **Step 4: ClubDetailTabs 게이트 확장**

`hasInfo`에 한 줄 추가:

```tsx
  const hasInfo = club.foundedYear !== null
    || club.cohortNumber !== null
    || formatClubFee(club.feeCycle, club.membershipFeeAmount) !== null
    || club.feeNote !== null
    || club.location !== null
    || club.contactPhone !== null
    || club.contactVisibility !== 'PUBLIC';
```

- [ ] **Step 5: 테스트 실행**

Run (cwd `frontend/`): `pnpm --filter web test -- club-detail-info-list club-detail-tabs`
Expected: 전부 PASS. 이어서 회귀 확인: `pnpm --filter web test` 전체 PASS + `pnpm typecheck` PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/
git commit -m "feat(frontend): 동아리 상세 회비 안내 노출 — 대표 회비 없이도 안내문 표시"
```

---

## 마무리 (오케스트레이터 수행)

- [ ] `pnpm lint` (cwd `frontend/`) + `./gradlew test` 전체 (cwd `backend/`) 최종 확인
- [ ] (선택) 시각 QA: `pnpm dev`(:3000)로 관리 폼 textarea·상세 페이지 노출 확인 후 dev 서버 종료
- [ ] PR 생성: 제목 `feat: 동아리 회비 안내문 — 관리 폼 입력·상세 페이지 노출` (BE+FE 공통이라 scope 생략), 본문 🚀/🤔/💬 템플릿, 자동 머지 금지
