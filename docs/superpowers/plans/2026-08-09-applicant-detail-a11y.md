# 지원자 상세 화면 접근성·모바일 품질 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목록 PR #939/#941/#942 가 확립한 접근성·모바일 기준(outline 포커스, 44px 히트 영역, 하우스 토큰, pill 배지, 하단 고정 액션 바, 실사용 경로 테스트)을 지원자 상세 화면(`applicants/[applicationId]/`)에 동일하게 적용한다.

**Architecture:** 상세 화면 12개 컴포넌트 중 UI 를 가진 9개를 손보되, 정책·훅·API 는 건드리지 않는다. 포커스는 outline 표준(forced-colors 생존), 상태 배지는 `APPLICATION_STATUS_BADGE_CLASS` 공용 상수, 모바일 상태 변경은 목록 `BulkActionBar` 와 같은 `data-bottom-bar` 고정 바 패턴을 쓴다.

**Tech Stack:** Next.js 15 App Router · React 19 · Tailwind (하우스 토큰) · vitest + @testing-library/react · msw

## Global Constraints

- **작업 디렉터리:** 프론트 명령은 전부 `frontend/apps/web/` 에서. 테스트: `pnpm vitest run <파일>`, 타입: `pnpm typecheck`.
- **브랜치:** `feat/applicant-detail-a11y` (develop 에서 분기, 이미 생성됨). **push 금지. PR 생성 금지.** 커밋만 한다.
- **커밋:** Conventional Commits 한국어, 제목은 `대상 — 변경점`. `Co-Authored-By`/🤖 라인 **금지**.
- **절대 변경 금지:** `applicationStatusTransitions.ts` 의 전이 로직, `closedRecruitment.ts` 의 문구·매핑, `packages/hooks`·`packages/api` 전체, neighbors 교집합 정책, `filtersToQuery` 의 5키 직렬화, `withDestinationParticle` 라벨(“합격으로” 등), raw status 게이트(`finalizeOnly`).
- **포커스 표준 (ring 금지):** box-shadow(ring) 는 forced-colors 에서 사양상 무시된다. 비-`.btn` 요소에는 이 문자열을 그대로 붙인다:
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`
- **히트 영역:** 인터랙티브 요소는 `min-h-11`(44px). 텍스트형 버튼이 카드 높이를 부풀리면 목록 전례처럼 음수 마진(`-my-2` 등)으로 상쇄한다. 버튼 한 줄 유지 규칙: `btn-sm + min-h-11` (BulkActionBar.tsx:44-50 주석의 320px 실측 근거).
- **토큰 매핑 (raw 팔레트 → 하우스):**
  | raw | house |
  |---|---|
  | `rounded border border-neutral-200 bg-white p-4` (섹션 래퍼) | `card p-4` |
  | `border-neutral-300` | `border-line` |
  | `rounded` (4px, 어휘 밖) | `rounded-sm` (8px) |
  | `text-slate-900` (제목) | `text-ink` |
  | `text-slate-700` `text-slate-600` `text-neutral-600` `text-neutral-700` | `text-charcoal-2` |
  | `text-slate-500` `text-slate-400` `text-neutral-500` `text-neutral-400` | `text-charcoal-3` (5.3:1 AA) |
  | `bg-neutral-100` 상태 pill | `APPLICATION_STATUS_BADGE_CLASS[status]` + `px-2 py-0.5 text-[11px]` |
  | `bg-sky-100 text-sky-700` | `pill pill-sky px-2 py-0.5 text-[11px]` |
  | rose 계열 배지 | `pill pill-coral px-2 py-0.5 text-[11px]` |
  | `text-blue-600` (수정) | `btn btn-ghost btn-sm min-h-11` |
  | `text-rose-600` (삭제) | `btn btn-danger-quiet btn-sm min-h-11` |
  | `bg-blue-50` (내 평가 카드 틴트) | `bg-sage-tint` |
  | `bg-blue-500` / `bg-neutral-300` (타임라인 도트, aria-hidden) | `bg-ink` / `bg-sage-soft` |
- **@tailwindcss/forms 미설치:** 네이티브 input 에 플러그인 스타일이 있다고 가정하지 말 것. 라디오는 네이티브 외형 그대로 두고 라벨만 44px 로 감싼다.
- **accessible name 규율 (WCAG 2.5.3):** 장식 화살표(`‹ › ← →`)는 `<span aria-hidden="true">` 로 감싸 accname 에서 뺀다. aria-label 을 새로 줄 때는 가시 텍스트를 반드시 포함한다. 인라인 span 은 accname 에 공백을 넣지 않으므로 이름이 붙어버리는 조합을 만들지 말 것.
- **테스트 규율:** role/name 쿼리 우선. placeholder 쿼리는 라벨이 생기면 role 쿼리로 교체. jsdom 이 못 보는 것(반응형 노출, 포커스, 히트 영역)은 목록 전례처럼 클래스 단언으로 못박고 주석으로 이유를 남긴다 (`bulk-action-bar.test.tsx:159-174` 스타일).
- **import:** `cn` 은 `@/app/_lib/cn`(경로는 파일 내 기존 import 관례 확인), 상태 상수는 `app/_constants/application-status.ts`. `useRouter` 직접 import 금지(기존 `useGuardedRouter` 유지).

---

### Task 1: `.btn` 공통 포커스 규칙 + ApplicantNavBar

**Files:**
- Modify: `frontend/apps/web/app/globals.css` (`.btn:disabled` 블록 근처)
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantNavBar.tsx`
- Test: `frontend/apps/web/test/manage/applicants/detail/applicant-nav-bar.test.tsx`

**Interfaces:**
- Produces: `.btn:focus-visible` 전역 규칙 (이후 모든 태스크의 `.btn` 계열 버튼이 이 포커스를 얻는다 — 개별 클래스 추가 불필요)

- [ ] **Step 1: 실패하는 테스트 먼저** — `applicant-nav-bar.test.tsx` 의 이름 결합을 새 기준으로 교체하고 히트 영역 단언을 추가

```tsx
// 기존 '‹ 이전' / '다음 ›' / '← 목록' 이름을 전부 교체:
screen.getByRole('button', { name: '이전' });
screen.getByRole('button', { name: '다음' });
screen.getByRole('link', { name: '목록' });

/* 화살표는 장식이라 accname 에서 뺀다 — SR 이 "홑화살괄호 이전"으로 읽던 문제의 회귀 가드.
 * role name 은 정규화된 전체 문자열 매치라 '‹ 이전' 이 남아 있으면 실패한다. */
it('이전/다음 접근 이름에 장식 화살표가 섞이지 않는다', () => {
  renderNavBar({ prevId: 1, nextId: 3 });
  expect(screen.getByRole('button', { name: '이전' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
});

/* jsdom 은 CSS 를 모르니 클래스로 못박는다 — 44px 터치 기준(DESIGN.md Touch Target). */
it('내비 버튼과 목록 링크는 44px 히트 영역을 가진다', () => {
  renderNavBar({ prevId: 1, nextId: 3 });
  expect(screen.getByRole('button', { name: '이전' })).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: '다음' })).toHaveClass('min-h-11');
  expect(screen.getByRole('link', { name: '목록' })).toHaveClass('min-h-11');
});

it('상태 배지는 공용 pill 상수를 쓴다', () => {
  renderNavBar({ currentStatus: 'SUBMITTED' });
  expect(screen.getByText('지원 완료').className).toContain('pill');
});
```
(`renderNavBar` 는 파일의 기존 렌더 헬퍼를 그대로 쓴다. 기존 disabled/QS 테스트는 이름만 바꿔 유지.)

- [ ] **Step 2: 실패 확인** — `pnpm vitest run test/manage/applicants/detail/applicant-nav-bar.test.tsx` → 이름 매치 실패로 FAIL

- [ ] **Step 3: globals.css 에 `.btn` 포커스 규칙 추가** (`.btn:disabled` 규칙 바로 아래)

```css
/* 키보드 포커스 — ring(box-shadow)은 forced-colors 에서 사양상 무시돼 표시가 사라지므로
   outline 만 쓴다(ApplicantCheckbox 의 outline 표준과 동일 근거). */
.btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
```
(`var(--ink)` 는 `.cal-upcoming-row:focus-visible` 이 이미 쓰는 변수 — 정의 위치를 확인만 하고 그대로 쓴다.)

- [ ] **Step 4: ApplicantNavBar 구현** — 마크업을 아래로 교체 (링크/이동 로직, `useGuardedRouter`, `filtersToQuery` 는 그대로)

```tsx
<nav aria-label="지원자 탐색" className="card flex flex-wrap items-center gap-2 p-3">
  <Link
    href={toRoute(`/manage/clubs/${clubId}/recruitments/${recruitmentId}/applicants${qs ? `?${qs}` : ''}`)}
    className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-sm text-charcoal-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
  >
    <span aria-hidden="true">←</span> 목록
  </Link>
  <button
    type="button"
    disabled={!prevHref}
    onClick={/* 기존 그대로 */}
    className="ml-3 inline-flex min-h-11 items-center gap-1 rounded-sm border border-line px-3 text-sm text-charcoal-2 hover:border-sage disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
  >
    <span aria-hidden="true">‹</span> 이전
  </button>
  <button type="button" disabled={!nextHref} onClick={/* 기존 그대로 */} className={/* 이전과 동일, ml-3 제외 */}>
    다음 <span aria-hidden="true">›</span>
  </button>
  <span
    className={cn(
      APPLICATION_STATUS_BADGE_CLASS[currentStatus],
      'ml-auto shrink-0 px-2 py-0.5 text-[11px]',
    )}
  >
    {APPLICATION_STATUS_LABEL[currentStatus]}
  </span>
</nav>
```
- `flex-wrap`: 320px 에서 pill 이 다음 줄로 내려갈 수 있게 (찌그러짐 방지).
- disabled 는 네이티브 `disabled` 유지 (첫/마지막 지원자). 비활성 컨트롤은 1.4.3 대비 예외지만 `opacity-40 → opacity-50` 으로 완화.
- import 추가: `cn`, `APPLICATION_STATUS_BADGE_CLASS`.

- [ ] **Step 5: 통과 확인** — 같은 명령 PASS. `pnpm typecheck` PASS.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css 'app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantNavBar.tsx' test/manage/applicants/detail/applicant-nav-bar.test.tsx
git commit -m "fix(frontend): 지원자 상세 내비 — 하우스 토큰·44px 히트 영역·장식 화살표 accname 제거·.btn 공통 outline 포커스"
```

---

### Task 2: StatusActionBar 모바일 하단 바 + 버튼 위계 + 컨테이너

**Files:**
- Modify: `.../[applicationId]/_components/StatusActionBar.tsx`
- Modify: `.../[applicationId]/_components/StatusConfirmDialog.tsx`
- Modify: `.../[applicationId]/_components/ApplicantDetailPage.tsx` (컨테이너만)
- Test: `frontend/apps/web/test/manage/applicants/detail/status-action-bar.test.tsx`, `frontend/apps/web/test/manage/applicants/closed-readonly.test.tsx` (필요 시 쿼리 스코프만 수정)

**Interfaces:**
- Consumes: Task 1 의 `.btn:focus-visible` (버튼 개별 포커스 클래스 불필요)
- Produces: 모바일 하단 바 `role="region" aria-label="상태 변경 액션"` + `data-bottom-bar` (ToastProvider 가 토스트 위치 계산에 읽는 규약 — `ToastProvider.tsx:116-123`)

- [ ] **Step 1: 실패하는 테스트** — `status-action-bar.test.tsx` 에 추가/수정

```tsx
/* 데스크탑 카드와 모바일 하단 바가 같은 버튼을 두 벌 렌더한다.
 * jsdom 은 CSS 를 모르니 두 벌이 동시에 보이지 않는 조건(lg 분기)을 클래스로 못박는다. */
it('모바일 하단 바는 데스크탑에서 숨고, 데스크탑 카드는 모바일에서 숨는다', () => {
  renderBar({ currentStatus: 'SUBMITTED' });
  const bottomBar = screen.getByRole('region', { name: '상태 변경 액션' });
  expect(bottomBar).toHaveClass('lg:hidden');
  expect(bottomBar).toHaveAttribute('data-bottom-bar');
  const desktopSection = screen.getByRole('heading', { name: '상태 변경' }).closest('section');
  expect(desktopSection?.className).toContain('hidden');
  expect(desktopSection?.className).toContain('lg:block');
});

it('하단 바 버튼은 44px 히트 영역과 위계(합격=primary, 불합격=danger-quiet)를 가진다', () => {
  renderBar({ currentStatus: 'INTERVIEW_PENDING', useInterview: true });
  const bottomBar = screen.getByRole('region', { name: '상태 변경 액션' });
  const accept = within(bottomBar).getByRole('button', { name: '합격으로' });
  const reject = within(bottomBar).getByRole('button', { name: '불합격으로' });
  expect(accept.className).toContain('btn-primary');
  expect(accept).toHaveClass('min-h-11');
  expect(reject.className).toContain('btn-danger-quiet');
});
```
기존 테스트 중 `getByRole('button', { name: '합격으로' })` 처럼 단일 매치를 전제한 곳은 두 벌 렌더로 다중 매치가 되므로 `within(screen.getByRole('region', { name: '상태 변경 액션' }))` 스코프로 감싼다 (동작 검증은 모바일 바 기준 한 벌이면 충분 — 클릭 핸들러는 공유).

- [ ] **Step 2: 실패 확인** — region 없음으로 FAIL.

- [ ] **Step 3: StatusActionBar 구현**

버튼 위계 상수와 공용 렌더러를 파일 상단에 추가:

```tsx
/* 목록 툴바(#942)와 같은 위계 — 합격만 솔리드, 불합격은 danger-quiet(AA), 나머지는 secondary. */
const TRANSITION_BUTTON_CLASS: Partial<Record<ApplicationStatus, string>> = {
  ACCEPTED: 'btn btn-primary btn-sm min-h-11',
  REJECTED: 'btn btn-danger-quiet btn-sm min-h-11',
};
const DEFAULT_TRANSITION_BUTTON_CLASS = 'btn btn-secondary btn-sm min-h-11';
```

컴포넌트는 (1) 즉시 전이 중인 대상을 추적해 스피너를 보여주고, (2) 데스크탑 카드 + 모바일 고정 바 두 벌을 렌더한다:

```tsx
const [inFlightTarget, setInFlightTarget] = useState<ApplicationStatus | null>(null);
// requestStatusChange(target) 진입 시 setInFlightTarget(target), onSettled 에서 null 복원.

const renderTransitionButtons = () =>
  transitions.map((target) => (
    <button
      key={target}
      type="button"
      onClick={() => (isFinalStatus(target) ? setPendingFinalStatus(target) : requestStatusChange(target))}
      disabled={updateStatus.isPending}
      className={TRANSITION_BUTTON_CLASS[target] ?? DEFAULT_TRANSITION_BUTTON_CLASS}
    >
      {updateStatus.isPending && inFlightTarget === target && <ButtonSpinner />}
      {withDestinationParticle(APPLICATION_STATUS_LABEL[target])}
    </button>
  ));

return (
  <>
    <section className={cn('card p-4', transitions.length > 0 && 'hidden lg:block')}>
      <h2 className="mb-3 text-base font-semibold text-ink">상태 변경</h2>
      {finalizeOnly && transitions.length > 0 && (
        <p className="mb-3 text-sm text-charcoal-3">{CLOSED_STATUS_CHANGE_NOTICE}</p>
      )}
      {transitions.length === 0 ? (
        <p className="text-sm text-charcoal-3">
          {finalizeOnly ? CLOSED_ALREADY_DECIDED_NOTICE : '더 이상 변경 가능한 상태가 없습니다.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">{renderTransitionButtons()}</div>
      )}
    </section>

    {transitions.length > 0 && (
      /* 모바일에선 액션이 페이지 최하단에 매몰돼 전체를 스크롤해야 했다 — 목록 BulkActionBar 와
         같은 고정 바 패턴. data-bottom-bar 는 ToastProvider 가 토스트 위치 계산에 읽는 규약. */
      <div
        role="region"
        aria-label="상태 변경 액션"
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:px-6">
          {finalizeOnly && <p className="text-xs text-charcoal-3">{CLOSED_STATUS_CHANGE_NOTICE}</p>}
          <div className="grid grid-cols-2 gap-2">{renderTransitionButtons()}</div>
        </div>
      </div>
    )}

    {/* StatusConfirmDialog 마운트 기존 그대로 */}
  </>
);
```
- `transitions.length === 0` 이면 하단 바 없음 → 안내 문단이 있는 카드가 모바일에서도 보인다 (`hidden lg:block` 을 조건부로만 적용하는 이유).
- `ButtonSpinner` 는 `StatusConfirmDialog.tsx` 가 쓰는 것과 같은 import.
- 성공 피드백(라이브 리전): `requestStatusChange` 와 `confirmFinalStatus` 의 성공 경로에 `addToast('상태를 변경했습니다.', { variant: 'success' })` 추가 — 기존 실패 토스트와 같은 `addToast` API. variant 이름은 ToastProvider 의 실제 시그니처를 확인해 맞춘다(목록 일괄 처리의 성공 토스트 전례를 grep 해 문구 톤도 맞출 것).

- [ ] **Step 4: StatusConfirmDialog** — 불합격 확인 버튼의 코랄 직접 칠(3.12:1 미달)을 토큰으로:

```ts
const CONFIRM_BUTTON_CLASS: Record<FinalStatus, string> = {
  ACCEPTED: 'btn btn-primary btn-sm min-h-11 disabled:opacity-50',
  REJECTED: 'btn btn-danger btn-sm min-h-11 disabled:opacity-50',
};
```
취소 버튼에도 `min-h-11` 추가.

- [ ] **Step 5: ApplicantDetailPage 컨테이너** — 중첩 `<main>` 해소 + 하단 바 자리 확보:

```tsx
// ManageShell 이 이미 <main> 을 렌더한다 — 목록 페이지(page.tsx:274)와 같은 이유로 div.
<div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-4">
```
(6rem = 하단 바 실높이 + 여유. 데스크탑은 바가 없으니 `lg:pb-4` 로 원복. `sm:px-6` 은 목록과 좌우 정렬 일치.)

- [ ] **Step 6: 테스트 실행** — `pnpm vitest run test/manage/applicants/detail/status-action-bar.test.tsx test/manage/applicants/closed-readonly.test.tsx` → PASS. closed-readonly 가 다중 매치로 깨지면 쿼리를 region/section 스코프로 좁히되 **검증 의도는 유지**한다. `pnpm typecheck` PASS.

- [ ] **Step 7: Commit** — `feat(frontend): 지원자 상세 상태 변경 — 모바일 하단 고정 바·버튼 위계·성공 토스트·중첩 main 해소`

---

### Task 3: 정보 패널 overflow·토큰 (Profile / Answers / Timeline / OtherEvaluations)

**Files:**
- Modify: `.../_components/ApplicantProfilePanel.tsx`, `ApplicantAnswersPanel.tsx`, `StatusTimeline.tsx`, `OtherEvaluationsList.tsx`
- Test: `frontend/apps/web/test/manage/applicants/detail/status-timeline.test.tsx`, `other-evaluations-list.test.tsx`, Create: `applicant-profile-panel.test.tsx`

- [ ] **Step 1: 실패하는 테스트** — Create `test/manage/applicants/detail/applicant-profile-panel.test.tsx`

dl/dt/dd 는 role 쿼리가 어색하므로 `container.querySelector` 클래스 단언 — 기존 `applicant-interview-schedule-card.test.tsx:291-293` 의 `container.querySelector('dt')` 전례를 따른다. detail fixture 는 `ApplicantProfilePanel` 의 props 타입에 맞춰 최소 필드로 파일 안에 직접 만든다(다른 detail 테스트의 fixture 구성을 참고).

```tsx
import { render } from '@testing-library/react';
import { ApplicantProfilePanel } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel';

/* 320px 에서 '단과대 · 전공' 결합 문자열이 고정 2열(50%)에 갇혀 넘치던 문제.
 * jsdom 은 레이아웃을 모르니 클래스로 못박는다. */
it('프로필 dl 은 라벨 자동폭 그리드이고 값 셀은 줄바꿈된다', () => {
  const { container } = render(<ApplicantProfilePanel detail={fixtureDetail} />);
  const definitionList = container.querySelector('dl');
  expect(definitionList?.className).toContain('grid-cols-[auto_minmax(0,1fr)]');
  const valueCell = container.querySelector('dd');
  expect(valueCell?.className).toContain('break-words');
});
```

- [ ] **Step 2: 실패 확인** — FAIL (기존 `grid-cols-2`).

- [ ] **Step 3: 구현**

ApplicantProfilePanel:
```tsx
// 고정 2열(50%)은 320px 에서 값 컬럼이 144px 로 좁아져 '단과대 · 전공' 이 넘친다.
// 라벨은 내용폭, 값은 나머지 전부 + minmax(0)으로 그리드 블로우아웃 차단.
<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
```
dt → `text-charcoal-3`, dd → `break-words text-charcoal-2` (기존 raw 팔레트는 토큰 매핑 표대로). 섹션 래퍼 → `card p-4`, `<h2>` → `text-ink`.

ApplicantAnswersPanel: 답변 본문에 `break-words` 추가(`whitespace-pre-wrap break-words`), 빈 상태에도 `<h2>응답</h2>` 을 유지하고 문단만 교체(헤딩 구조 대칭), 빈 문구 `text-charcoal-3`. 래퍼 `card p-4`.

StatusTimeline: 도트(aria-hidden 유지) `bg-blue-500` → `bg-ink`, `bg-neutral-300` → `bg-sage-soft`. 텍스트 토큰 매핑. 래퍼 `card p-4`.

OtherEvaluationsList: 헤더 행 `flex items-center gap-2` → 이름 span 에 `min-w-0 truncate`, 날짜에 `shrink-0`, 점수 배지 `bg-neutral-100` → `pill pill-outline px-2 py-0.5 text-[11px] shrink-0`. 메모 `whitespace-pre-wrap break-words`. 빈 상태 `text-neutral-400`(2.53:1) → `text-charcoal-3`. 래퍼는 EvaluationPanel 구조 확인 후 동일 규칙.

- [ ] **Step 4: 통과 확인** — `pnpm vitest run test/manage/applicants/detail/` → 전부 PASS (`status-timeline`·`other-evaluations` 는 텍스트 기반이라 통과 유지가 정상 — 깨지면 원인 확인).

- [ ] **Step 5: Commit** — `fix(frontend): 지원자 상세 정보 패널 — 320px overflow 가드(break-words·min-w-0)·하우스 토큰·대비 미달 문구 수정`

---

### Task 4: MyEvaluationCard — textarea 라벨·라디오 44px·버튼 토큰

**Files:**
- Modify: `.../_components/MyEvaluationCard.tsx`
- Test: `frontend/apps/web/test/manage/applicants/detail/my-evaluation-card.test.tsx`

- [ ] **Step 1: 실패하는 테스트** — `getByPlaceholderText(/강점, 약점/)` 7곳 전부를 실사용 경로 쿼리로 교체 + 추가:

```tsx
// placeholder 는 accessible name 이 아니다 — 라벨이 생겼으니 role 로 잡는다.
screen.getByRole('textbox', { name: '메모' });

it('점수 라디오는 44px 히트 영역 라벨로 감싸져 있다', () => {
  renderCard({ myEvaluation: null });
  const radio = screen.getByRole('radio', { name: '3' });
  const label = radio.closest('label');
  expect(label).not.toBeNull();
  expect(label).toHaveClass('min-h-11', 'min-w-11');
});

it('삭제 버튼은 danger-quiet 토큰을 쓴다', () => {
  renderCard({ myEvaluation: fixtureEvaluation });
  expect(screen.getByRole('button', { name: '삭제' }).className).toContain('btn-danger-quiet');
});
```

- [ ] **Step 2: 실패 확인** — textbox name 매치 실패로 FAIL.

- [ ] **Step 3: 구현**

- textarea 라벨 연결 (A-4):
```tsx
<label htmlFor={`evaluation-memo-${applicationId}`} className="text-xs text-charcoal-2">
  메모
</label>
<textarea
  id={`evaluation-memo-${applicationId}`}
  /* 기존 props 유지 */
  className="... focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
/>
```
  textarea 테두리는 레포의 하우스 토큰 textarea 전례(모집 작성 폼 등)를 grep 해 그대로 따른다 — 임의 발명 금지.
- 점수 라디오: 컨테이너 `flex flex-wrap items-center gap-1`, 각 라벨:
```tsx
<label key={n} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 text-sm text-charcoal-2">
```
  (5개 × 44px + "점수" 라벨 ≈ 274px — 320px 뷰포트 288px 안에 들어간다. fieldset + sr-only legend + aria-hidden 시각 라벨 구조는 **올바른 패턴이므로 유지**.)
- 수정/삭제: `text-xs text-blue-600` → `btn btn-ghost btn-sm -my-2 min-h-11`, `text-rose-600` → `btn btn-danger-quiet btn-sm -my-2 min-h-11` (음수 마진으로 카드 헤더 높이 유지 — 목록 전례).
- 저장/취소: `btn btn-primary btn-sm min-h-11` / `btn btn-secondary btn-sm min-h-11`.
- 카드 틴트 `bg-blue-50` → `bg-sage-tint`, 나머지 raw 팔레트 토큰 매핑.

- [ ] **Step 4: 통과 확인** — `pnpm vitest run test/manage/applicants/detail/my-evaluation-card.test.tsx` PASS.

- [ ] **Step 5: Commit** — `fix(frontend): 지원자 상세 내 평가 — 메모 라벨 연결·점수 라디오 44px 라벨·danger 토큰 버튼`

---

### Task 5: ApplicantInterviewScheduleCard — 링크 히트 영역·pill 통일

**Files:**
- Modify: `.../_components/ApplicantInterviewScheduleCard.tsx`
- Test: `frontend/apps/web/test/manage/applicants/detail/applicant-interview-schedule-card.test.tsx`

- [ ] **Step 1: 실패하는 테스트**

```tsx
it('면접 관리 링크는 44px 히트 영역을 가진다', () => {
  /* 해당 분기 렌더 후 */
  expect(screen.getByRole('link', { name: '면접 관리에서 조정' })).toHaveClass('min-h-11');
});
```
동시에 기존 안티패턴 2건 수정:
- `:77` `expect(badge.className).toMatch(/rose/)` → 토큰 전환에 맞춰 `toContain('pill-coral')`
- `:235` `queryByRole('blockquote')` (존재하지 않는 role — 항상 null 이라 무의미) → `queryByLabelText('지원자가 작성한 대체 가능 시간 설명')`

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
- 두 링크(`면접 관리에서 조정`, `면접 관리`): `inline-flex min-h-11 shrink-0 items-center` + `btn btn-secondary btn-sm min-h-11` 로 통일 (기존 `aria-label="면접 관리에서 조정"` 유지 — 올바른 처리).
- 헤더 `<h2>` 에 `min-w-0 break-words` (긴 라운드 제목이 링크를 밀어내지 않게, 링크는 `shrink-0` 유지).
- 배지: `bg-sky-100 text-sky-700` → `pill pill-sky px-2 py-0.5 text-[11px]`, rose 계열 → `pill pill-coral px-2 py-0.5 text-[11px]`. memberStatus 6분기 배지도 같은 pill 어휘로 매핑(의미: 부정/취소=coral, 대기=warm, 확정=기본 pill — 기존 색 의미 유지).
- 나머지 raw 팔레트 토큰 매핑, 래퍼 `card p-4`.

- [ ] **Step 4: 통과 확인** — `pnpm vitest run test/manage/applicants/detail/applicant-interview-schedule-card.test.tsx` PASS.

- [ ] **Step 5: Commit** — `fix(frontend): 지원자 상세 면접 카드 — 링크 44px·pill 통일·무의미한 blockquote role 단언 수정`

---

### Task 6: 전체 검증 (오케스트레이터가 직접)

- [ ] `frontend/` 에서 `pnpm test -- --run` 전체 PASS
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm build` PASS (빌드는 `frontend/` 루트에서)
- [ ] dev 서버 :3000 + Playwright 실측 — 320/360/390/430/데스크탑: 가로 overflow 0, 하단 바가 콘텐츠 가림 없음(pb 예약 확인), 키보드 Tab 순회 시 outline 포커스 가시, 이전/다음 이동, 상태 변경 플로우(확인 모달 포함), 마감(finalizeOnly) 분기
- [ ] QA 종료 후 dev 서버 종료

## Out of Scope (이번 범위에서 제외 — 보고만)

- **이전/다음 버튼의 링크화(B-4):** `useGuardedRouter` 오프라인 가드가 의도된 정책이라 `<Link>` 전환은 정책 변경 — 보고만 한다.
- **`filtersToQuery` 5키 직렬화(D-5):** 이웃 이동 시 미지 파라미터 유실 — 기존 정책 유지, 보고만.
- **StatusTimeline key 충돌 가능성(D-6)**, **메모 글자 수 카운터(D-4)**, **neighbors API 에 위치(n/전체) 정보 추가**: 별도 이슈 후보.
- 상세 밖 화면(admin 등)의 raw 팔레트 잔존.
