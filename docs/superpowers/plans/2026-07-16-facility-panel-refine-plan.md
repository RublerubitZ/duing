# 시설 예약 패널 보완 3건 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 구문.

**Goal:** 슬롯 토글 해제 버그 수정 + 선택 날짜 현황 요약(상태 집계·운영 시간) + 운영행 정책 안내 박스.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-16-facility-panel-refine-design.md` §1~§3. FE 단독(백엔드 무변경) — 순수 계산은 `bookingCalendar.ts`, UI는 `PanelSummaryCard`/`DaySlotList`.

**Tech Stack:** Next.js 15 / React 19, vitest + testing-library.

## Global Constraints

- 스펙 §1~§3의 규칙·문구를 구속 조건으로 그대로 따른다. 특히 §3 정책 설명 문구 고정:
  `"시간 범위가 함께 표시된 일정은 운영상 확보된 시간 안내예요. 이 시간에도 예약을 신청할 수 있고, 관리자 승인 후 학교 반영 절차를 거쳐 확정돼요."`
  (승인 주체 = "관리자", 예상 시간 암시 금지, "총동연" 금지)
- 집계·운영 시간은 전부 `day.slots` 파생 — FE 시각 상수 하드코딩 금지.
- `any`/`as` 금지(`as const` 예외), `type`만, 두잉 토큰만(rounded-xl=28px·md=14px 주의), 테스트 절대 날짜 타임밤 금지.
- 커밋: 한국어 Conventional Commits(`fix(frontend): ...`/`feat(frontend): ...`), Co-Authored-By/🤖 금지. push·PR 금지(컨트롤러 몫).
- pnpm 명령은 `frontend/`에서.

---

### Task 1: 슬롯 토글 해제 규칙 수정 (버그픽스)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`toggleSlotSelection`)
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`

**Interfaces:** 시그니처 무변경 — `toggleSlotSelection(current, tapped, slots): SlotRange | null`. 호출부(FacilityBookingPage·DaySlotList 경유) 수정 없음.

- [ ] **Step 1: 실패 테스트 작성 (RED)** — 기존 toggle 테스트 블록에 추가:

```ts
// 슬롯 픽스처는 파일의 기존 makeSlot/slots 헬퍼를 재사용한다(없으면 AVAILABLE 09~22 13칸 헬퍼 신설).
it('다중 범위에서 마지막 슬롯을 재탭하면 그 슬롯만 해제된다', () => {
  // current 18:00~20:00, tap 19:00~20:00 → 18:00~19:00
});
it('다중 범위에서 중간 슬롯을 재탭하면 그 지점부터 끝까지 해제된다', () => {
  // current 18:00~21:00, tap 19:00~20:00 → 18:00~19:00
});
it('다중 범위에서 첫 슬롯을 재탭하면 전체가 해제된다', () => {
  // current 18:00~20:00, tap 18:00~19:00 → null
});
```

기존 케이스(단일 재탭 해제·연속 확장·비연속 재시작·불가 슬롯 무시)는 그대로 통과해야 한다.

- [ ] **Step 2: 실패 확인** — `cd frontend && pnpm --filter web test booking-calendar-lib` → 신규 3건 FAIL(현재는 범위가 그대로 유지됨)

- [ ] **Step 3: 구현** — `toggleSlotSelection`에서 기존 "정확히 동일 단일 슬롯" 분기를 내부 재탭 분기로 교체:

```ts
  if (!current) {
    return single;
  }
  if (slotInRange(tapped, current)) {
    // 선택된 슬롯 재탭 = 그 슬롯부터 끝까지 해제(첫 슬롯이면 전체 해제) — 연속 범위 계약 유지
    return tapped.start === current.start ? null : { start: current.start, end: tapped.start };
  }
```

(기존 `current.start === single.start && current.end === single.end → null` 분기는 새 분기에 흡수되므로 삭제. 이후 union·확장 로직 무변경.)

- [ ] **Step 4: GREEN 확인** — 동일 명령 전건 PASS
- [ ] **Step 5: 커밋** — `fix(frontend): 선택 범위 내 슬롯 재탭 시 해제되지 않던 토글 수정`

---

### Task 2: 현황 요약 집계·운영 시간 + 운영행 정책 안내

**Files:**
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`slotStatusCounts` 신설)
- Modify: `frontend/apps/web/app/facilities/_components/booking/PanelSummaryCard.tsx`
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx`
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`, `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces (Consumes):** Task 1과 독립(같은 파일의 다른 함수). `BookingDayAvailability.slots[].status` = 'AVAILABLE' | 'PENDING_HOLD' | 'BLOCKED' | 'PAST', `day.operatingNotes[]` = { organization, start, end }.

- [ ] **Step 1: 집계 헬퍼 + 실패 테스트 (RED)**

`bookingCalendar.ts`:

```ts
export type SlotStatusCounts = { available: number; pendingHold: number; blocked: number; past: number };

export function slotStatusCounts(slots: BookingAvailabilitySlot[]): SlotStatusCounts {
  const counts: SlotStatusCounts = { available: 0, pendingHold: 0, blocked: 0, past: 0 };
  for (const slot of slots) {
    if (slot.status === 'AVAILABLE') counts.available += 1;
    else if (slot.status === 'PENDING_HOLD') counts.pendingHold += 1;
    else if (slot.status === 'BLOCKED') counts.blocked += 1;
    else counts.past += 1;
  }
  return counts;
}
```

lib 테스트: 혼합 슬롯 집계 정확성 1건. 컴포넌트 테스트(RED):
(a) PanelSummaryCard — 혼합 day 렌더 시 `신청 가능 N칸`·`승인 대기 N칸`·`예약됨 N칸` 노출, 0건 상태 미노출, `운영 시간 09:00~22:00`(슬롯 파생) 노출.
(b) DaySlotList — operatingNotes 있는 day 렌더 시 "운영 시간 안내" 박스에 단체명+시간 나열과 §3 고정 문구 노출, 없는 day는 박스 미렌더.

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components booking-calendar-lib` → 신규 단언 FAIL

- [ ] **Step 3: PanelSummaryCard 구현** — 날짜 행 아래에 상태 집계 행 + 운영 시간 행 추가(다크 카드 시각 언어 유지):

```tsx
const counts = slotStatusCounts(day.slots);
const operatingRange = day.slots.length > 0
  ? `${day.slots[0]?.start}~${day.slots[day.slots.length - 1]?.end}`
  : null;
const statusEntries = [
  { key: 'available', label: '신청 가능', count: counts.available, dotClass: 'bg-sage' },
  { key: 'pendingHold', label: '승인 대기', count: counts.pendingHold, dotClass: 'bg-coral' },
  { key: 'blocked', label: '예약됨', count: counts.blocked, dotClass: 'bg-cream/40' },
  { key: 'past', label: '지난 시간', count: counts.past, dotClass: 'bg-cream/15' },
].filter((entry) => entry.count > 0);
```

```tsx
<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cream/80">
  {statusEntries.map((entry) => (
    <span key={entry.key} className="inline-flex items-center gap-1">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${entry.dotClass}`} />
      {entry.label} <span className="font-mono font-bold text-cream">{entry.count}칸</span>
    </span>
  ))}
</div>
{operatingRange && (
  <p className="mt-1.5 text-[11px] text-cream/50">운영 시간 {operatingRange} · {day.slots.length}칸</p>
)}
```

(배치는 날짜 `<p>`와 분포바 `<div className="mt-3 …">` 사이. 도트 색은 슬롯 리스트 시각 언어와 정합 — 대기=coral, 가능=sage.)

- [ ] **Step 4: DaySlotList 안내 박스 구현** — 기존 한 줄 `<p>` 를 교체:

```tsx
{day.operatingNotes.length > 0 && (
  <div className="mb-2 rounded-lg border border-line bg-graysoft/40 px-3 py-2 text-xs">
    <p className="font-bold text-ink">운영 시간 안내</p>
    <p className="mt-0.5 text-charcoal-2">
      {day.operatingNotes.map((note) => `${note.organization} ${note.start}~${note.end}`).join(' · ')}
    </p>
    <p className="mt-1 text-charcoal-3">
      시간 범위가 함께 표시된 일정은 운영상 확보된 시간 안내예요. 이 시간에도 예약을 신청할 수 있고,
      관리자 승인 후 학교 반영 절차를 거쳐 확정돼요.
    </p>
  </div>
)}
```

- [ ] **Step 5: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 6: 커밋** — `feat(frontend): 예약 패널에 날짜 현황 요약·운영행 정책 안내 추가`

---

### Task 3: 예약 현황 리스트 SLOT_STYLE 정합 + 퀵칩 제거 (2차 요구)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx`
- Modify: `frontend/apps/web/app/facilities/_components/booking/PanelSummaryCard.tsx`
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingPanel.tsx` (onQuickSelect 전달 제거)
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`firstAvailableStarts` 삭제)
- Test: `frontend/apps/web/test/facilities/booking-components.test.tsx`, `booking-calendar-lib.test.ts`, `facility-booking-page.test.tsx`

**Interfaces:** DaySlotList props 무변경(day·selection·onToggleSlot). PanelSummaryCard props는 `{ day }`만 남는다.

- [ ] **Step 1: 실패 테스트 갱신 (RED)**

스펙 §4′.1 매핑 표를 테스트로 고정:
(a) DaySlotList — AVAILABLE 행 "예약 가능" 라벨 + `bg-sage-mist` 클래스, PENDING_HOLD 행 "승인 대기" + 여전히 클릭 가능(onToggleSlot 호출), BLOCKED(SCHOOL) 행 단체명, BLOCKED(INTERNAL) 행 "예약됨", 선택 행 `bg-ink`.
(b) PanelSummaryCard — "바로 신청 가능한 시간" 미렌더, 집계 라벨 "예약 가능 N칸".
(c) 기존 "신청 가능"/"승인 대기중" 단언은 새 라벨로 갱신(페이지 테스트 포함 — grep으로 전수).
(d) lib — firstAvailableStarts 테스트 삭제.

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components booking-calendar-lib facility-booking-page` → 신규/갱신 단언 FAIL

- [ ] **Step 3: 구현**

DaySlotList — 상태→행 클래스 Record(스펙 §4′.1 표의 클래스 문자열 그대로)와 라벨 함수 갱신. 행 내용 구조(좌측 mono 시간, 우측 라벨/단체명, aria-pressed, disabled)는 유지하되 py 를 3 으로 소폭 확대. 선택 행은 기존 `border-ink bg-ink text-cream` 계열 유지(테두리만 ink-deep 로).

PanelSummaryCard — quickStarts·remaining·퀵칩 섹션(border-t 블록)·`onQuickSelect` prop 제거, 집계 라벨 '신청 가능'→'예약 가능'. BookingPanel — `<PanelSummaryCard day={day} />`로.

bookingCalendar.ts — `firstAvailableStarts` 삭제(다른 사용처 없음 grep 확인).

- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 예약 현황 리스트를 목업 상태색 행으로 정합·퀵칩 제거`

---

### Task 4: 슬롯 행 By 중심 세로 스택 전환 (3차 요구)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx`
- Test: `frontend/apps/web/test/facilities/booking-components.test.tsx`, `frontend/apps/web/test/facilities/facility-booking-page.test.tsx`(단언 파급 시)

**Interfaces:** DaySlotList props 무변경(day·selection·onToggleSlot). 스펙 §4″.1 이 유일한 요구 원천.

- [ ] **Step 1: 실패 테스트 갱신 (RED)** — §4″.1 을 고정:
(a) SCHOOL 행 — 단체명이 주 정보(text-sm font-bold 요소)로, "예약됨" pill 배지 존재.
(b) INTERNAL 행 — 주 정보 "예약됨", pill 배지 없음(중복 금지).
(c) PENDING_HOLD 행 — 주 정보 "승인 대기", 배지 없음, 여전히 클릭 가능.
(d) AVAILABLE 행 — 주 정보 "예약 가능", 시간이 별도 행(font-mono).
(e) 선택 행 — ✓ + ink, aria-label "HH:MM~HH:MM 주정보" 순.
기존 단언 중 우측 인라인 구조를 전제한 것은 갱신.

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-components` → 신규/갱신 단언 FAIL
- [ ] **Step 3: 구현** — 행 내부를 세로 스택으로: 시간(`font-mono text-[11px]` muted) → 주 정보(`text-sm font-bold`, `organization ?? 상태 문구`) → SCHOOL 만 pill 배지(스펙 §4″.1 클래스 계열, 선택 시 cream 반전). 행 배경색 Record·disabled·aria-pressed·운영 안내 박스 무변경.
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 슬롯 행을 예약 주체 중심 세로 스택으로 전환`

---

### Task 5: 예약 건별 현황 카드 (4차 요구 — §4″ 롤백 후 대체)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`dayBookingEntries` 신설)
- Create: `frontend/apps/web/app/facilities/_components/booking/DayBookingOverview.tsx`
- Modify: `frontend/apps/web/app/facilities/_components/booking/BookingPanel.tsx` (요약 카드와 DaySlotList 사이 삽입)
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`, `frontend/apps/web/test/facilities/booking-components.test.tsx`

**Interfaces:** 스펙 §4‴ 가 유일한 요구 원천. DaySlotList·PanelSummaryCard 는 절대 무변경(§4″ 롤백 상태 유지).

- [ ] **Step 1: 파생 헬퍼 + 실패 테스트 (RED)**

`dayBookingEntries(slots)`: BLOCKED(SCHOOL=단체명/INTERNAL="예약됨")·PENDING_HOLD("승인 대기")만 추출, **인접(prev.end==next.start)·같은 kind·같은 label 병합**. AVAILABLE·PAST 제외. 반환 `{ start, end, label, kind }[]`(시간순).

lib 테스트: (a) 같은 단체 연속 3칸 → 1건(09:00~12:00), (b) 다른 단체 인접 → 병합 안 됨, (c) INTERNAL 연속 → "예약됨" 1건, (d) 사이가 AVAILABLE 로 끊기면 2건, (e) 예약 없음 → []. 컴포넌트 테스트: 카드 제목 "{M월 d일} 예약 현황", 행(시간·이름) 렌더, PENDING 행 warm 도트·"승인 대기", "그 외 시간 · 예약 가능 · N개 시간" 행, 예약 0건이면 카드 미렌더, BookingPanel 에서 요약 카드와 슬롯 리스트 사이 순서.

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-calendar-lib booking-components` → 신규 FAIL
- [ ] **Step 3: 구현** — 스펙 §4‴.2 의 카드·행·마지막 행(점선 구분)·미렌더 규칙 그대로. `bookingDateLabel` 재사용해 제목 구성.
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 예약 건별 현황 카드 추가(요약과 시간 선택 사이)`

---

### Task 6: 백엔드 — INTERNAL 차단 슬롯 동아리명 노출 (5차 요구 §4⁗.1, 별도 브랜치)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/FacilitySlotAssembler.java` (`BookingSlice`에 organization 추가, INTERNAL 분기 노출, 관련 주석 반전 현행화)
- Modify: `backend/src/main/java/com/duing/domain/facilitybooking/service/GeneralFacilityAvailabilityService.java` (`toBookingSlices` — 차단(blocksSlot) 예약의 club 이름 배치 조회·주입, 비노출 주석 교체)
- Test: `FacilitySlotAssemblerTest`, 가용성 acceptance/통합 테스트의 INTERNAL organization 단언 반전

**Interfaces (Produces — Task 7이 의존):** 가용성 응답 슬롯 — BLOCKED+blockedBy=INTERNAL 에 `organization`=동아리명(Club.name). PENDING_HOLD 는 계속 organization 없음.

- [ ] **Step 1: 실패 테스트 (RED)** — 어셈블러 단위: INTERNAL 차단 슬라이스에 organization 지정 시 슬롯에 그대로 노출(blockedBy=INTERNAL 유지), PENDING 은 여전히 null. 통합/acceptance: 내부 APPROVED 예약이 있는 날 해당 슬롯 organization == 동아리명. 기존 "INTERNAL 비노출" 단언은 반전 결정(§4⁗.1, 2026-07-17 사용자 결정)으로 교체 — 주석에 근거(승인 완료는 크롤로 어차피 실명 공개) 명기.
- [ ] **Step 2: 실패 확인** — `cd backend && ./gradlew test --tests FacilitySlotAssemblerTest` FAIL
- [ ] **Step 3: 구현** — `BookingSlice(date, start, end, status, organization)`. `toBookingSlices`: `blocksSlot()` 예약의 clubId 수집 → ClubRepository 배치 조회(findAllById) → id→name 맵 → 차단 슬라이스에만 이름 주입(PENDING 은 null). 어셈블러 INTERNAL 분기 `new SlotAvailability(..., SlotBlockSource.INTERNAL, internalBlock.get().organization())`. 삭제(soft-delete)된 club 방어: 이름 못 찾으면 null(FE "예약됨" 폴백).
- [ ] **Step 4: 전체 스위트** — `./gradlew test` BUILD SUCCESSFUL (전 건수 보고)
- [ ] **Step 5: 커밋** — `feat(backend): 공개 가용성 INTERNAL 차단 슬롯에 동아리명 노출(승인 대기는 비노출 유지)`

### Task 7: 프론트 — 이름 우선 표기 + 슬롯 행 흰 바탕 복원 (5차 요구, 브랜치 feat/facility-panel-refine)

**Files:**
- Modify: `frontend/packages/types/src/facility.ts` (organization 주석 현행화)
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`bookingEntryOf` — BLOCKED label = `organization ?? '예약됨'`, kind 유지)
- Modify: `frontend/apps/web/app/facilities/_components/booking/DaySlotList.tsx` (라벨 organization 우선 + §4⁗.2 흰 바탕 행 클래스 복원)
- Test: `booking-calendar-lib.test.ts`, `booking-components.test.tsx`(+페이지 테스트 파급 시)

**Interfaces (Consumes):** Task 6 응답 계약. 단, organization 부재(구 백엔드)여도 "예약됨" 폴백으로 동작해야 한다(fail-open).

- [ ] **Step 1: 실패 테스트 (RED)** — (a) lib: INTERNAL 슬라이스에 organization 있으면 entries label=이름, 없으면 "예약됨"(폴백), 인접 병합은 label 기준이라 이름 다르면 비병합. (b) DaySlotList: BLOCKED+organization(INTERNAL) 행 이름 표기, AVAILABLE 행 `bg-paper`(상태색 배경 부재), PENDING_HOLD 라벨 `text-coral`, BLOCKED 행 muted(bg-graysoft/60). (c) 기존 상태색 단언(bg-sage-mist 등) 갱신.
- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-calendar-lib booking-components` FAIL
- [ ] **Step 3: 구현** — 스펙 §4⁗.1(FE)·§4⁗.2 그대로: SLOT_ROW_CLASS 를 흰 바탕 세트로 교체(AVAILABLE·PENDING_HOLD=`border-line bg-paper hover:border-sage`, BLOCKED·PAST=`border-transparent bg-graysoft/60 text-charcoal-3`), 라벨 색만 PENDING_HOLD=coral. slotStatusLabel·bookingEntryOf 는 `slot.organization` 우선(소스 무관).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 예약 표기 동아리명 우선·슬롯 행 흰 바탕 복원`

---

### Task 8: 운영행 분할 타임라인 (6차 요구, 브랜치 feat/facility-operating-split)

**Files:**
- Modify: `frontend/apps/web/app/facilities/_lib/bookingCalendar.ts` (`dayOverviewTimeline(slots, operatingNotes)` 신설 — kind 'OPERATING' 추가)
- Modify: `frontend/apps/web/app/facilities/_components/booking/DayBookingOverview.tsx` (타임라인 렌더·운영 조각 행·그 외 개수 재정의·미렌더 조건 갱신)
- Test: `frontend/apps/web/test/facilities/booking-calendar-lib.test.ts`, `booking-components.test.tsx`(+페이지 테스트 파급 시)

**Interfaces:** 스펙 §5 가 유일한 요구 원천. DaySlotList·PanelSummaryCard·운영 안내 박스·백엔드 무변경.

- [ ] **Step 1: 실패 테스트 (RED)** — §5.1/§5.2 고정:
(a) lib: 운영 09~20 + 확정 10~12 → [09~10 운영, 10~12 예약, 12~20 운영] / 예약 2건(10~12·15~17) → 5행 / 예약이 노트 경계 일치(09~12) → 앞 조각 없음 / 운영행만 → 통짜 1조각 / 운영 밖 예약 → 분할 없음·타임라인에 둘 다 / PENDING 도 분할 기준 / 정렬(동률 시 예약 먼저).
(b) 컴포넌트: 운영 조각 행 "(운영 시간)" 접미 + sage 도트, 그 외 N=운영 구간 밖 AVAILABLE 만(운영 구간 내 AVAILABLE 은 제외), N=0 이면 그 외 행 미렌더, 운영행만 있는 날 카드 렌더(기존 "예약 0건 미렌더" 단언 갱신).

- [ ] **Step 2: 실패 확인** — `pnpm --filter web test booking-calendar-lib booking-components` FAIL
- [ ] **Step 3: 구현** — 스펙 §5.1 커서 절단 알고리즘·§5.2 표기 그대로. 시간 비교는 'HH:MM' 사전순(파일 상단 관례).
- [ ] **Step 4: GREEN + 전체 검증** — `pnpm lint && pnpm typecheck && pnpm --filter web test` 전건 PASS(수치 보고)
- [ ] **Step 5: 커밋** — `feat(frontend): 현황 카드에 운영행 분할 타임라인 표시`
