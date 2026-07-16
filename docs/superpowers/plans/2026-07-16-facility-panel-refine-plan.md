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
