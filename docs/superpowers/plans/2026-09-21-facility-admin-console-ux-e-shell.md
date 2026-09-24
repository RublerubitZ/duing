# 시설 예약 관리자 콘솔 UX — PR-E 페이지 셸·시간표·안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 시설 예약 페이지에서 탭을 오가도 필터·선택이 남고(E1), 시간표의 선택 가능 블록에서도 터치로 상세를 열 수 있으며(E2), 화면 목적 안내를 접어 둘 수 있게(E3) 한다.

**Architecture:** 셸(`AdminFacilityBookingsPage`)은 방문한 탭을 언마운트하지 않고 `hidden` 패널로 유지한다(lazy keep-alive, 상태는 `useState<Set>` + 렌더 중 파생 갱신). 시간표는 블록 `<button>` 의 형제로 절대 배치한 상세 버튼을 추가한다. 안내 배너는 `useSyncExternalStore`(서버 스냅샷 = 펼침)로 localStorage 접힘 상태를 하이드레이션 이후에만 반영한다.

**Tech Stack:** Next.js 15 App Router · React 19 · TanStack Query · Vitest + Testing Library(jsdom) · Tailwind

**Spec:** `docs/superpowers/specs/2026-09-21-facility-admin-console-ux-design.md` §2.5 (E1~E3), §3 테스트 전략, §4 PR-E

## Global Constraints

- 브랜치 `fix/facility-admin-shell-ux`(`develop` 기준, 다른 PR 에 의존 없음). PR 은 `develop` 대상, squash.
- 커밋 메시지: Conventional Commits + 한국어 `type(scope): 대상 — 변경점`. `Co-Authored-By` / `🤖` 라인 금지.
- `any` 금지, `as` 타입 단언 금지(타입 가드·Zod), 타입 선언은 `type` 만(`interface` 금지).
- `useEffect` 안에서 데이터 패칭 금지. 서버 상태는 TanStack Query 만. `useQuery` 내부 mock 금지(훅 단위 mock 은 허용 — 기존 테스트 패턴).
- `'use client'` 는 브라우저 API·훅이 필요한 파일에만.
- 변수명은 역할이 드러나게(`data`/`res`/`e` 금지).
- localStorage 읽기·쓰기는 반드시 `try/catch`(`app/_lib/infoMenu.ts` 관례). SSR 프레임과 클라 첫 렌더가 달라지면 안 된다(React 19 hydration 함정) — 서버 스냅샷은 항상 "펼침".
- 태스크 GREEN 조건(FE): `pnpm vitest run <폴더>` + `pnpm typecheck` + `pnpm lint` 셋 다 통과. 명령은 `frontend/apps/web` 에서 실행(`pnpm install` 은 `frontend/` 에서).
- 기존 테스트 단언을 바꿀 때는 이유를 주석으로 남긴다.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx` | 탭 셸(레일·URL 동기화·탭 콘텐츠 마운트) | E1: 방문 탭 keep-alive, `id`/`aria-controls` |
| `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx` | 셸 통합 테스트 | E1 케이스 1개 추가 |
| `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionTimetable.tsx` | 제출 시간표 | E2: selectable 블록 옆 상세 버튼 |
| `frontend/apps/web/test/admin/facility-submission/submission-timetable.test.tsx` | 시간표 테스트 | E2 케이스 1개 추가 + 기존 셀렉터 1곳 좁힘 |
| `frontend/apps/web/app/admin/facility-bookings/_components/PurposeNote.tsx` | 화면 목적 안내 배너 | E3: 접기 토글 + 저장 |
| `frontend/apps/web/test/admin/facility-bookings/purpose-note.test.tsx` (신규) | 배너 테스트 | E3 케이스 3개 |

---

### Task 1: E1 — 방문한 탭 keep-alive (`hidden` 패널)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx:98` (`const activeTab = resolveTab(...)` 아래 상태 추가), `:146-152` (탭 버튼 속성), `:233-239` (콘텐츠 렌더 6줄)
- Test: `frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx`

**Interfaces:**
- Consumes: 기존 `TAB_KEYS`, `FacilityOpsTab`, `resolveTab`, 탭 컴포넌트 5종(props 불변).
- Produces: 패널 DOM 계약 — 각 방문 탭은 `<div id="facility-ops-panel-{tab}" role="tabpanel" aria-labelledby="facility-ops-tab-{tab}" hidden={비활성}>`, 탭 버튼은 `id="facility-ops-tab-{tab}" aria-controls="facility-ops-panel-{tab}"`. 미방문 탭은 DOM 에 없다. 다른 PR(B1) 은 이 파일의 `tabCountOf` 한 줄만 만지므로 이 구조와 충돌하지 않는다. **PR-D(D4) 가 검토 탭 시설 셀렉트를 `useFacilityListQuery` 로 바꾸면** 이 태스크 테스트의 `mockUsageQuery.mockReturnValue({ data: { facilities: [...] } })` 는 옵션을 만들지 못한다 — squash 라운드 재병합 때 후행 PR 이 `useFacilityListQuery: () => ({ data: [{ id: 100, roomName: '세미나실' }] })` 로 바꾼다.

- [ ] **Step 1: 실패 테스트 작성**

`admin-bookings-page.test.tsx` 의 마지막 `it('정렬 선택은 탭을 바꿔도 유지된다 …')` 뒤, `describe` 닫는 `});` 앞에 추가한다. 테스트의 `next/navigation` mock 은 `mockTabParam` 으로 URL 을 흉내내므로, 탭 전환은 `mockTabParam` 을 바꾸고 `rerender` 로 재현한다(클릭은 `router.replace` 만 호출하고 URL 은 바뀌지 않는다).

```tsx
  it('방문한 탭은 hidden 으로 남아 필터가 유지되고, 미방문 탭은 DOM 에 없다 (keep-alive, 스펙 E1)', () => {
    // 검토 탭 시설 셀렉트에 고를 수 있는 시설을 준다(기본 mock 은 data: undefined → '전체 시설'만).
    mockUsageQuery.mockReturnValue({ data: { facilities: [{ id: 100, roomName: '세미나실' }] } });
    const { rerender } = render(<AdminFacilityBookingsPage />);

    fireEvent.change(screen.getByRole('combobox', { name: '시설 필터' }), { target: { value: '100' } });
    expect(screen.getByRole('combobox', { name: '시설 필터' })).toHaveValue('100');
    // 미방문 탭(크롤)은 아직 DOM 에 없다.
    expect(screen.queryByText('크롤 예약이 없어요')).not.toBeInTheDocument();

    // 크롤 탭으로 이동(URL 변경을 rerender 로 재현) → 검토 패널은 hidden, 크롤 패널은 보임.
    mockTabParam = 'crawl';
    rerender(<AdminFacilityBookingsPage />);
    expect(screen.getByText('크롤 예약이 없어요')).toBeVisible();
    expect(screen.getByRole('combobox', { name: '시설 필터', hidden: true })).not.toBeVisible();

    // 검토 탭 복귀 → 셀렉트 값이 남아 있고, 크롤 패널은 hidden 으로 잔존한다.
    mockTabParam = null;
    rerender(<AdminFacilityBookingsPage />);
    expect(screen.getByRole('combobox', { name: '시설 필터' })).toHaveValue('100');
    expect(screen.getByText('크롤 예약이 없어요')).not.toBeVisible();
    // 한 번도 안 간 탭(제출 준비)은 여전히 DOM 에 없다.
    expect(screen.queryByRole('tabpanel', { name: /제출 준비/, hidden: true })).not.toBeInTheDocument();
    // 탭 버튼 ↔ 패널 연결(접근성).
    expect(screen.getByRole('tab', { name: /예약 검토/ })).toHaveAttribute('aria-controls', 'facility-ops-panel-review');
    expect(screen.getByRole('tabpanel', { name: /예약 검토/ })).toHaveAttribute('id', 'facility-ops-panel-review');
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/admin-bookings-page.test.tsx -t "keep-alive"`
Expected: FAIL — 크롤 탭 이동 후 `getByRole('combobox', { name: '시설 필터', hidden: true })` 를 못 찾음(검토 탭이 언마운트됨).

- [ ] **Step 3: 최소 구현**

`AdminFacilityBookingsPage.tsx` — 세 군데를 바꾼다.

(a) 상태 추가. `const activeTab = resolveTab(searchParams.get('tab'));` 바로 아래에:

```tsx
  // 방문한 탭 집합(스펙 E1 keep-alive) — 한 번 마운트된 탭은 hidden 으로 남겨 필터·페이지·선택·초안을 보존한다.
  // 활성 탭이 아직 집합에 없으면 렌더 중 파생 갱신(React 공식 "이전 렌더 정보 저장" 패턴, useEffect 불필요).
  // 딥링크·뒤로가기로 activeTab 이 바뀌어도 같은 경로로 합류한다.
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<FacilityOpsTab>>(() => new Set([activeTab]));
  if (!visitedTabs.has(activeTab)) {
    setVisitedTabs(new Set(visitedTabs).add(activeTab));
  }
```

import 를 `import { Fragment, useState, type ReactNode } from 'react';` 로 바꾼다.

(b) 탭 버튼(`<button type="button" role="tab" …>`)에 두 속성 추가:

```tsx
              <button
                type="button"
                role="tab"
                id={`facility-ops-tab-${tab}`}
                aria-controls={`facility-ops-panel-${tab}`}
                aria-selected={isActive}
                onClick={() => selectTab(tab)}
```

(c) 콘텐츠 렌더(`{activeTab === 'review' && <BookingManagementTab />}` ~ `{activeTab === 'open' && <FacilityOpenDateTab />}` 6줄)를 아래로 교체:

```tsx
      {/* 방문한 탭만 마운트하고, 비활성은 hidden 으로 유지한다(스펙 E1). 첫 진입 요청 수는 활성 탭뿐이라 불변.
          hidden 탭의 쿼리는 마운트 상태라 invalidate 시 함께 refetch 된다(탭 5개 × 소량 — 허용). */}
      {TAB_KEYS.filter((tab) => visitedTabs.has(tab)).map((tab) => (
        <div
          key={tab}
          id={`facility-ops-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`facility-ops-tab-${tab}`}
          hidden={activeTab !== tab}
        >
          {TAB_CONTENT[tab]}
        </div>
      ))}
```

그리고 `TAB_PURPOSE` 선언 아래(컴포넌트 밖)에 콘텐츠 맵을 둔다. 이력 탭 주석은 그대로 옮긴다.

```tsx
// 탭 → 콘텐츠 대응표(기존 조건부 렌더 6줄 대체). React 의 리마운트 판정은 key+type 이라 인라인이어도 리마운트되지 않는다 — 상수는 가독성 목적일 뿐이다.
const TAB_CONTENT: Record<FacilityOpsTab, ReactNode> = {
  review: <BookingManagementTab />,
  prepare: <SubmissionPrepareTab />,
  ready: <SubmissionBatchesTab statusFilter="REVIEWING" />,
  // 이력 탭은 완료·취소만(ARCHIVED) — 진행 중 배치는 '제출 대기' 탭에서만 보이도록 단계를 가른다.
  archive: <SubmissionBatchesTab statusFilter="ARCHIVED" />,
  crawl: <FacilityCrawlTab />,
  open: <FacilityOpenDateTab />,
};
```

- [ ] **Step 4: 통과 확인 + 기존 단언 점검**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/admin-bookings-page.test.tsx`
Expected: 전부 PASS. 기존 케이스 중 "이전 탭이 사라진다"류 단언(`queryByText('승인 대기')` 부재, `queryByRole('button', { name: /오늘 접수/ })` 부재)은 모두 **초기 탭이 해당 탭인 렌더**라 검토 탭을 방문한 적이 없어 그대로 통과한다. 만약 실패하면 그 케이스가 탭 전환 후 부재를 단언하는 것이니 `.not.toBeVisible()` 로 바꾸고 주석 `// keep-alive(스펙 E1): 언마운트가 아니라 hidden` 을 단다.

- [ ] **Step 5: GREEN 3종 + 커밋**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: 테스트 전부 PASS, typecheck 출력 없음, lint 는 기존 경고(`app/notifications/page.tsx` exhaustive-deps) 외 신규 없음.

```bash
git add frontend/apps/web/app/admin/facility-bookings/_pages/AdminFacilityBookingsPage.tsx frontend/apps/web/test/admin/facility-bookings/admin-bookings-page.test.tsx
git commit -m "fix(frontend): 시설 예약 관리 탭 — 방문한 탭을 hidden 으로 유지해 전환 시 필터·선택 초기화 제거"
```

---

### Task 2: E2 — 시간표 selectable 블록에 상세 버튼

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionTimetable.tsx:70-115`
- Test: `frontend/apps/web/test/admin/facility-submission/submission-timetable.test.tsx:61-77` (셀렉터 좁힘), 신규 케이스 추가

**Interfaces:**
- Consumes: 기존 props `onShowDetail(booking)`, `onToggleSelect(bookingId)`, `bookingTimeLabel`.
- Produces: selectable 블록마다 접근성 이름 `"{YYYY-MM-DD} {HH:mm~HH:mm} {동아리} 상세"` 인 버튼. 블록 자체의 이름은 변경 없음(`"{날짜} {시간} {동아리}[ · 선택됨] · {상태}"`).

- [ ] **Step 1: 기존 셀렉터 좁히기 + 실패 테스트 작성**

새 상세 버튼의 이름에도 동아리명이 들어가므로 `getByRole('button', { name: /합주부/ })` 는 두 개를 잡게 된다. 기존 케이스(`:61-77`)의 셀렉터를 블록에만 있는 `" · "` 구분자로 좁힌다:

```tsx
    // 상세 버튼(E2)도 동아리명을 포함하므로 상태 구분자(" · ")가 있는 블록만 잡는다.
    const block = screen.getByRole('button', { name: /합주부 · / });
```

그리고 `describe` 마지막(`CONFIRMED 블록…` 케이스 뒤)에 추가:

```tsx
  it('선택 가능한 블록에도 상세 버튼이 있어 클릭하면 선택 토글 없이 상세를 연다 (스펙 E2)', () => {
    const onToggleSelect = vi.fn();
    const onShowDetail = vi.fn();
    const booking = makeBooking();
    render(
      <SubmissionTimetable
        bookings={[booking]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={onToggleSelect}
        onShowDetail={onShowDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '2026-08-01 18:00~21:00 합주부 상세' }));
    expect(onShowDetail).toHaveBeenCalledWith(booking);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('선택 불가 블록(제출함)에는 별도 상세 버튼이 없다 — 블록 클릭이 이미 상세다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /상세$/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-submission/submission-timetable.test.tsx`
Expected: 새 첫 케이스 FAIL(`상세` 버튼 없음). 나머지는 PASS.

- [ ] **Step 3: 최소 구현**

`SubmissionTimetable.tsx` 에서 `<div className="group relative">…</div>` 래퍼가 닫힌 직후, `</td>` 앞에 상세 버튼을 **형제**로 둔다(블록이 `<button>` 이라 안에 버튼을 넣을 수 없다 — `button > button` 은 무효 HTML). `td` 는 이미 `relative` 다.

```tsx
                    </div>
                    {/* selectable 블록은 클릭=선택 토글이라 상세로 갈 길이 없었다(hover 툴팁은 터치 불가).
                        블록 <button> 의 형제로 절대 배치한 상세 버튼(스펙 E2) — 블록 안에 넣으면 button>button 무효 HTML. */}
                    {booking.selectable && (
                      <button
                        type="button"
                        aria-label={`${row.dateIso} ${bookingTimeLabel(booking.startTime, booking.endTime)} ${booking.clubName ?? '동아리'} 상세`}
                        onClick={() => onShowDetail(booking)}
                        className="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-paper/90 text-[10px] font-bold leading-none text-charcoal-2 shadow-sm hover:bg-paper hover:text-ink"
                      >
                        i
                      </button>
                    )}
                  </td>
```

파일 상단 컴포넌트 javadoc 의 "selectable 블록 클릭=선택 토글(상세는 hover 툴팁)" 문장을 "selectable 블록 클릭=선택 토글, 상세는 우측 상단 상세 버튼(터치 가능) + hover 툴팁" 으로 고친다.

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-submission/submission-timetable.test.tsx`
Expected: 전부 PASS.

- [ ] **Step 5: GREEN 3종 + 커밋**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-submission && pnpm typecheck && pnpm lint`
Expected: PASS / 출력 없음 / 신규 경고 없음. (`submission-prepare-tab.test.tsx` 등 시간표를 포함 렌더하는 테스트가 `/합주부/` 같은 넓은 셀렉터를 쓰면 여기서 드러난다 — 같은 방식으로 `" · "` 를 붙여 좁힌다.)

```bash
git add frontend/apps/web/app/admin/facility-bookings/submission/_components/SubmissionTimetable.tsx frontend/apps/web/test/admin/facility-submission/submission-timetable.test.tsx
git commit -m "fix(frontend): 제출 시간표 — 선택 가능 블록에 상세 버튼 추가(터치 기기에서 hover 툴팁 대체)"
```

---

### Task 3: E3 — PurposeNote 접기/펼치기 (localStorage, 하이드레이션 안전)

**Files:**
- Modify: `frontend/apps/web/app/admin/facility-bookings/_components/PurposeNote.tsx` (전체 교체)
- Create: `frontend/apps/web/test/admin/facility-bookings/purpose-note.test.tsx`

**Interfaces:**
- Consumes: 없음(props `children: ReactNode` 불변 — 셸 호출부 `<PurposeNote>{TAB_PURPOSE[activeTab]}</PurposeNote>` 그대로).
- Produces: 토글 버튼 이름 `접기` / `화면 안내 보기`. localStorage 키 `duing:admin:purpose-note:collapsed`, 값 `'1'`(접힘) / `'0'`. 서버 렌더는 항상 펼침.

- [ ] **Step 1: 실패 테스트 작성**

`test/admin/facility-bookings/purpose-note.test.tsx` 신규:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurposeNote } from '@/app/admin/facility-bookings/_components/PurposeNote';

const STORAGE_KEY = 'duing:admin:purpose-note:collapsed';

describe('PurposeNote', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('기본은 펼침이고, 접기를 누르면 본문이 사라지고 저장되며 리렌더 후에도 접힘이 유지된다', () => {
    const { rerender, unmount } = render(<PurposeNote>예약을 검토해 승인 또는 거절해요.</PurposeNote>);

    expect(screen.getByText('예약을 검토해 승인 또는 거절해요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '접기' }));

    expect(screen.queryByText('예약을 검토해 승인 또는 거절해요.')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');

    rerender(<PurposeNote>다른 탭 안내</PurposeNote>);
    expect(screen.queryByText('다른 탭 안내')).not.toBeInTheDocument();
    unmount();

    // 새로 마운트해도 저장값으로 접힘 유지 → 펼치면 본문 복귀.
    render(<PurposeNote>다시 마운트</PurposeNote>);
    fireEvent.click(screen.getByRole('button', { name: '화면 안내 보기' }));
    expect(screen.getByText('다시 마운트')).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0');
  });

  it('localStorage 저장이 실패해도(차단 환경) 접기·펼치기는 메모리 상태로 동작한다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    render(<PurposeNote>안내 본문</PurposeNote>);

    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.queryByText('안내 본문')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '화면 안내 보기' }));
    expect(screen.getByText('안내 본문')).toBeInTheDocument();
  });

  it('서버 스냅샷은 항상 펼침이다 — 저장값이 접힘이어도 SSR 마크업은 본문을 싣는다(하이드레이션 안전)', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    const { renderToString } = await import('react-dom/server');

    const html = renderToString(<PurposeNote>서버 본문</PurposeNote>);

    expect(html).toContain('서버 본문');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/purpose-note.test.tsx`
Expected: 첫 두 케이스 FAIL(`접기` 버튼 없음). 세 번째는 PASS(현재도 정적 펼침).

- [ ] **Step 3: 최소 구현**

`PurposeNote.tsx` 전체를 아래로 교체한다. `useOnlineStatus.ts`·`useHydrated.ts` 의 `useSyncExternalStore` 관례를 따른다.

```tsx
'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const STORAGE_KEY = 'duing:admin:purpose-note:collapsed';

// 접힘 상태 외부 스토어(스펙 E3) — localStorage 가 원본이고, 저장이 막힌 환경(차단·용량)에서는 메모리 값으로 대체한다.
// useState 초기값으로 localStorage 를 읽으면 SSR(펼침)과 클라 첫 렌더(접힘)가 달라 하이드레이션 경고가 나므로
// useSyncExternalStore 의 서버 스냅샷을 항상 펼침으로 두고 마운트 뒤에 저장값을 반영한다(useOnlineStatus 관례).
const listeners = new Set<() => void>();
let memoryFallback: boolean | null = null;

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

// 메모리 값은 이 세션에서 마지막으로 쓴 값(항상 미러). 저장이 막힌 환경(setItem 실패·getItem 실패 모두)에서도
// 토글이 먹게 하려고 읽기는 메모리를 우선한다. 모듈 상태라 테스트 사이에 남는다 — "저장값으로 마운트" 를 검증하는
// 테스트는 `vi.resetModules()` + 동적 import 로 모듈을 새로 받아야 한다(테스트 파일 상단 주석에 명시).
function readCollapsed(): boolean {
  if (memoryFallback !== null) return memoryFallback;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // localStorage 차단 — 기본 펼침
  }
}

function writeCollapsed(collapsed: boolean) {
  memoryFallback = collapsed;
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // 저장 실패 — 메모리 값으로 이 세션 동안만 유지
  }
  listeners.forEach((notify) => notify());
}

function getServerSnapshot(): boolean {
  return false;
}

/** 화면 목적 안내 배너(목업 PurposeNote) — sage-mist 카드 + 인포 아이콘 + 13px 본문. 접기 상태는 브라우저에 기억한다. */
export function PurposeNote({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, getServerSnapshot);

  return (
    <div className="flex items-start gap-2.5 rounded-[12px] bg-sage-mist px-4 py-[13px] text-[13px] leading-normal text-ink-deep">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-px h-[17px] w-[17px] shrink-0 text-ink"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      {/* 접힌 상태는 한 줄 — 본문 대신 펼치기 버튼만 남긴다(숙련 운영진의 세로 공간 절약). */}
      {collapsed ? (
        <button
          type="button"
          className="flex-1 text-left font-semibold text-ink underline-offset-2 hover:underline"
          onClick={() => writeCollapsed(false)}
        >
          화면 안내 보기
        </button>
      ) : (
        <>
          <div className="flex-1">{children}</div>
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-charcoal-3 hover:text-ink"
            onClick={() => writeCollapsed(true)}
          >
            접기
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings/purpose-note.test.tsx`
Expected: 3개 PASS. (`memoryFallback` 은 모듈 상태라 케이스 사이에 남는다 — 세 케이스 모두 토글로 시작하거나 서버 스냅샷만 보므로 영향 없다. "저장값 '1' 로 마운트하면 접힘" 같은 케이스를 추가할 때는 `vi.resetModules()` + `await import(...)` 로 모듈을 새로 받는다. 테스트 파일 상단에 이 주석을 남긴다.)

- [ ] **Step 5: GREEN 3종 + 커밋**

Run: `cd frontend/apps/web && pnpm vitest run test/admin/facility-bookings && pnpm typecheck && pnpm lint`
Expected: PASS / 출력 없음 / 신규 경고 없음. `admin-bookings-page.test.tsx` 는 PurposeNote 를 실제 렌더하므로 여기서 함께 회귀 확인된다(기본 펼침이라 기존 단언 불변).

```bash
git add frontend/apps/web/app/admin/facility-bookings/_components/PurposeNote.tsx frontend/apps/web/test/admin/facility-bookings/purpose-note.test.tsx
git commit -m "feat(frontend): 시설 예약 관리 화면 안내 — 접기/펼치기, 브라우저에 기억(SSR 은 항상 펼침)"
```

---

### Task 4: PR 생성

- [ ] **Step 1: 전체 web 스위트 1회** — PurposeNote·시간표는 공용 컴포넌트라 다른 테스트의 부분 mock 과 부딪힐 수 있다(메모리 규칙).

Run: `cd frontend/apps/web && pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: 전부 PASS.

- [ ] **Step 2: 푸시·PR**

```bash
git push -u origin fix/facility-admin-shell-ux
gh pr create --base develop --title "fix(frontend): 시설 예약 관리 셸 — 탭 전환 시 상태 유지·시간표 터치 상세·안내 접기" --body-file -
```

PR 본문(🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항, 파일명 나열 금지):

```
## 🚀 작업 내용
시설 예약 관리 페이지에서 탭을 오가면 검토 큐 필터·페이지, 제출 준비의 기간·검색·선택, 크롤 조회 조건, 오픈일 초안이 전부 초기화되던 문제를 없앴습니다. 한 번 연 탭은 화면에서 숨겨 두기만 하고 내리지 않습니다. 첫 진입 요청 수는 그대로입니다.
제출 시간표에서 선택 가능한 블록은 클릭이 곧 선택이라 상세를 볼 방법이 hover 툴팁뿐이었습니다. 블록 옆에 작은 상세 버튼을 두어 터치 기기에서도 상세 시트를 열 수 있습니다.
탭마다 나오는 화면 목적 안내를 접어 둘 수 있고, 접힘은 브라우저에 기억됩니다.

## 🤔 고민했던 내용
탭 상태를 URL 로 올리는 방안은 세 탭의 필터를 전부 직렬화해야 하고 선택 집합은 URL 에 못 실어 별도 저장이 또 필요해 기각했습니다. 숨겨 둔 탭의 조회는 마운트 상태라 다른 탭의 액션으로 무효화되면 함께 다시 불러오지만, 다섯 탭 소량이라 허용했습니다.
안내 접힘 초기값을 저장소에서 바로 읽으면 서버 마크업(펼침)과 첫 클라이언트 렌더(접힘)가 어긋나 하이드레이션 경고가 납니다. 서버는 항상 펼침으로 그리고 마운트 뒤에 저장값을 반영합니다.

## 💬 리뷰 중점사항
- 탭 버튼과 패널의 접근성 연결(aria-controls / aria-labelledby / hidden)
- 시간표 상세 버튼이 블록 버튼 안이 아니라 형제로 놓여 있는지(중첩 버튼 금지)
- 안내 접기 저장이 막힌 환경에서도 토글이 동작하는지
```

머지는 하지 않는다(사용자 지시 대기).

---

## Self-Review

- 스펙 커버리지: E1(keep-alive·aria 연결·3단언) → Task 1, E2(형제 버튼·stopPropagation 불필요한 형제 구조·selectable 만) → Task 2, E3(useSyncExternalStore·서버 스냅샷 펼침·try/catch·메모리 대체) → Task 3. 스펙 §3 GREEN 조건(폴더 테스트+typecheck+lint, 공용 컴포넌트는 전체 스위트) → 각 Task Step 5 + Task 4.
- 플레이스홀더: 없음. 모든 코드 스텝에 전문 코드. "적절히 처리" 류 문구 없음.
- 타입·이름 일관성: `facility-ops-panel-{tab}` / `facility-ops-tab-{tab}` 가 Task 1 구현·테스트에서 동일. `writeCollapsed`/`readCollapsed`/`memoryFallback` 이름이 Task 3 구현 안에서 일관. 시간표 상세 버튼 접근성 이름 형식 `"{날짜} {시간} {동아리} 상세"` 가 구현·테스트 동일.
