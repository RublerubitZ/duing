# 오버레이 뒤로가기 닫기(Back Dismiss) — 설계

2026-08-03 · 상태: 승인 대기

## 배경

모바일에서 바텀시트·모달·드로어가 열린 상태로 뒤로가기(안드로이드 시스템 버튼/제스처,
iOS Safari 엣지 스와이프, 브라우저 뒤로가기)를 하면 **시트는 그대로 둔 채 페이지가 이탈**한다.
네이티브 앱 관습(뒤로 = 최상단 레이어 닫기)과 어긋나고, 되돌아오면 시트가 닫힌 상태라
사용자가 하던 작업(작성 중이던 폼, 선택 중이던 필터)이 사라진다.

목표: **오버레이가 열려 있으면 어떤 형태의 뒤로가기든 최상단 오버레이 하나만 닫고 페이지는 유지**,
모두 닫힌 뒤에야 일반 페이지 뒤로가기가 동작한다. 기존 라우팅·히스토리(새로고침, 딥링크, Forward)는
손상하지 않는다.

## 결정 사항 (사용자 확정)

- 적용 범위는 **Radix Dialog 계열 전체**(모바일 시트 + 데스크톱 다이얼로그) + **수제 오버레이 전부** + **사진 라이트박스**
- **드롭다운/팝오버/콤보박스는 제외** — 메뉴를 열 때마다 히스토리 엔트리가 쌓이는 것이 과하다
- 엔트리 추적은 **깊이(개수)가 아니라 고유 ID + 문서 토큰**. 두 값은 `__overlayToken` / `__overlayId`
  **별도 필드로 분리**한다(문자열 하나에 섞지 않는다)
- `history.back()` 호출은 **두 지점으로 제한**(최상단 오버레이 코드 닫기 / 죽은 엔트리 자동 스킵)
- **문서 로드 시점에는 `history.back()` 을 호출하지 않는다** — 잔존 마커는 `replaceState` 로 제거만 하고
  자동 히스토리 이동은 하지 않는다
- `pushState`·`replaceState` 모두 **기존 `history.state` 를 펼쳐 보존**하고 오버레이 마커만 덮어쓴다.
  state 를 통째로 갈아치우지 않는다
- popstate 에서 **동기로 상태 변경을 하지 않는다** — 판정만 동기, 실행은 `queueMicrotask`
- 재진입 방어는 **게이트 플래그가 아니라 선(先) splice + 자기 유발 traversal 카운터**
- 알려진 "죽은 뒤로가기" 2건(중간 오버레이 코드 닫기 / 시트 연 채 링크 이동)은 **출시 전 해결**

## 왜 pushState 인가 (Next 15.5.18 실동작 확인)

아래는 **설치된 Next 15.5.18 의 `next/dist/client/components/app-router.js` 를 직접 읽고 확인한 동작**이다.
Next 내부 구현이라 마이너 업그레이드에서 바뀔 수 있는 **버전 의존 사실**로 취급하고, 코드에도 같은
경고를 주석으로 남긴다. Next 업그레이드 시 이 절의 전제를 재확인한다.

- Next 는 `window.history.pushState` 를 패치한다. **url 인자 없이** 호출하면
  `applyUrlFromHistoryPushReplace()` 를 건너뛴다 → **라우터 dispatch·리렌더·RSC 요청 0**.
- 패치는 `data.__NA` 또는 `data._N` 이 있으면 **조기 반환**해 원본 `pushState` 를 그대로 부른다.
  우리는 기존 `history.state` 를 펼쳐 `__NA` 와 내부 트리를 직접 들고 가므로 이 분기를 타고,
  "Next 가 내부 필드를 복사해 준다"는 동작에 **의존하지 않는다**. 남는 의존은 "url 인자를 넘기지 않으면
  URL 이 바뀌지 않는다"는 브라우저 명세뿐이다.
- 반대로 state 를 `{}` 로 갈아치우면 패치가 바뀌었을 때 `__NA` 가 유실되고, 그 엔트리로 되돌아올 때
  Next 의 popstate 핸들러가 **`location.reload()`** 를 호출한다(패치 코드에 실재하는 분기).
  그래서 push·replace 양쪽 모두 기존 state 보존이 필수다.
- 우리 엔트리는 **URL 이 아래 페이지 엔트리와 동일**하다. 따라서 판정이 어긋나 back 이 한 번
  더 일어나도 **화면 이동은 발생하지 않는다** (최악이 "아무 일도 안 일어남").
- popstate 로 우리 엔트리에 되돌아오면 Next 는 `__NA` 를 보고 same-URL traverse 로 처리하고,
  restore-reducer 는 `preserveCustomHistoryState: true` 라 **우리 마커를 보존**한다.

즉 URL 을 바꾸지 않으므로 새로고침·딥링크·SEO·Forward 동작에 영향이 없다.

## 아키텍처

새 파일 **`apps/web/app/_lib/backDismiss.ts`** 하나. 모듈 레벨 LIFO 스택 + popstate 리스너 1개 +
`useBackDismiss(open, onClose)` 훅.

### 히스토리 마커

```ts
history.pushState({ ...history.state, __overlayToken: DOCUMENT_TOKEN, __overlayId: id }, '');
```

- `DOCUMENT_TOKEN` — 문서 로드 시 1회 생성하는 랜덤 문자열. **새로고침 이전 문서가 남긴 엔트리와의
  ID 충돌을 차단**한다(토큰 불일치 = 남의 엔트리 = 죽은 엔트리).
- `__overlayId` — 문서 내 단조 증가 정수.
- `url` 인자는 넘기지 않는다(위 항목 참조).
- **기존 `history.state` 를 펼쳐 보존**하고 마커 두 개만 덮어쓴다. 로드 시 잔존 마커 제거도 동일하게
  `replaceState({ ...history.state, __overlayToken: undefined, __overlayId: undefined }, '')` 로
  **마커만 지운다**.

### 모듈 상태

```ts
type OverlayEntry = { id: number; close: () => void };
const stack: OverlayEntry[] = [];   // 열린 순서
let selfTraversals = 0;             // 우리가 유발한 traversal 잔여 수
let skipBudget = MAX_SKIPS;         // 10
```

`MAX_SKIPS = 10` 은 **무한 루프 방어용 안전장치**다. 정상 경로에서 연속으로 쌓이는 죽은 엔트리는
한두 개 수준이라 이 값에 도달하지 않는다. 도달했다면 판정 로직이나 히스토리 상태가 이미 어긋난
상황이므로, 더 이상 스킵하지 않고 브라우저 기본 동작에 맡기는 것이 안전하다.

리스너는 **첫 사용 시 1회 등록하고 문서 수명 동안 유지**한다. 스택이 빌 때마다 해제하면
"코드 닫기로 예약한 `history.back()` 이 아직 소화되지 않은 상태"에서 리스너가 사라져
자기 유발 traversal 회계가 깨진다. 등록은 `installed` 플래그로 1회만 — 중복 등록은 발생하지 않는다.

### popstate 처리

동기 구간(판정 + 스택 splice)과 비동기 구간(실행)을 분리한다.

```
1. state = history.state 를 동기로 읽는다      // 마이크로태스크 안에서 다시 읽지 않는다
2. isSelf = selfTraversals > 0
   isSelf 면 selfTraversals-- , 아니면 skipBudget 리셋   // 사용자 조작이면 예산 회복
3. 착지 판정
   - 토큰 일치 + 스택에 있는 ID  → 그 위의 오버레이들이 victim, landedIsDead = false
   - 토큰 일치 + 스택에 없는 ID  → **victim 없음(판정 보류)**, landedIsDead = true
   - 마커 없음(일반 페이지 엔트리) → victim = 스택 전체, landedIsDead = false
   - 토큰 불일치(이전 문서 잔존) → **victim 없음(판정 보류)**, landedIsDead = true
4. victim 을 스택에서 즉시 splice   // 재진입 popstate 가 같은 대상을 다시 집지 못하게
5. queueMicrotask(() => victim 을 LIFO 순으로 close())
6. landedIsDead && skipBudget > 0 이면
   queueMicrotask(() => { skipBudget--; selfTraversals++; history.back(); })
```

"마커 없음 → 전부 닫기"가 뒤로가기 **길게 눌러 여러 칸 점프**하는 경우까지 자동으로 커버한다.

**죽은 엔트리에 착지하면 아무것도 닫지 않는다(판정 보류).** 그 엔트리 *아래*에 있던 오버레이는
여전히 열려 있어야 하는데, 어느 것이 그런지는 한 칸 더 내려간 다음 위치에서만 알 수 있기 때문이다.
여기서 스택 전체를 닫으면 3중 중첩(a·b·c 중 b 만 코드로 닫은 상태)에서 뒤로가기 1회가 c 와 a 를
한꺼번에 닫는다 — 적대적 리뷰에서 실제로 검출된 결함이다. 단 스킵 예산이 바닥나 더 내려갈 수 없을
때는 안전망으로 전부 닫는다(오버레이가 열린 채 히스토리 보호가 없는 상태를 남기지 않기 위해).

**재진입 방어는 게이트가 아니라 순서로 한다.** "처리 중 popstate 무시" 플래그를 두면 자동 스킵의
연쇄(back → popstate → 재평가 → 필요시 또 back)가 끊겨 죽은 엔트리가 2개 이상일 때 동작하지 않는다.
4번의 선(先) splice 로 같은 오버레이가 두 번 닫히는 것을 막고, 무한 루프는 `skipBudget` 과
자기 유발 카운터로 막는다.

### 훅

```ts
useBackDismiss(open: boolean, onClose?: (() => void) | null): void
```

- `onClose` 가 없으면 no-op(닫을 수 없는 다이얼로그 — 예: `DraftResumeDialog`).
- `onClose` 는 ref 에 담아 매 렌더 갱신한다. effect 의존성은 `[open, generation]` 뿐이라
  인라인 화살표 함수를 넘겨도 재등록이 일어나지 않는다.
- **열림**: 엔트리 생성 → 스택 push → `pushState`.
- **정리(cleanup: 닫힘·언마운트 공통)**:
  - 스택에 없으면(popstate 가 이미 소비) 아무것도 하지 않는다.
  - 스택에서 제거한다. **최상단이었고** 현재 히스토리 state 가 내 마커일 때만
    `queueMicrotask` 로 가드 재확인 후 `history.back()`.
  - 최상단이 아니면(중간 오버레이) **히스토리를 건드리지 않는다** — 그 엔트리는 죽은 엔트리가 되고
    나중에 자동 스킵된다. 이것이 `history.back()` 호출을 줄이면서 죽은 뒤로가기를 없애는 핵심이다.
- **닫기 거부 대응**: popstate 로 `onClose()` 를 불렀는데 소비처가 무시하면(전송 중 `isPending` 가드 등)
  `open` 이 여전히 true 다. 소비 시 `generation` 을 증가시켜 effect 를 재실행 → **엔트리를 다시 push**한다.
  불변식은 "**열려 있는 동안 엔트리는 항상 정확히 1개**".

### 적용 지점

**공유 프리미티브 래핑 (호출처 무수정, 약 60곳 커버)**

- `components/ui/dialog.tsx` — `const Dialog = DialogPrimitive.Root` 를 래퍼 컴포넌트로 교체
- `components/ui/sheet.tsx` — 동일

```tsx
function Dialog({ open, onOpenChange, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  useBackDismiss(open === true, onOpenChange ? () => onOpenChange(false) : undefined);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props} />;
}
```

레포 내 Root 사용처는 **전부 `open` 제어형**이라(비제어 `defaultOpen` 사용처 0건) 이 래핑으로 전부 커버된다.

**수제 오버레이 — 훅 1줄씩**

| 파일 | 비고 |
| --- | --- |
| `app/clubs/[clubId]/member/_components/ClubEventFormModal.tsx` | 마운트=열림 |
| `app/clubs/[clubId]/member/_components/ClubNoticeFormModal.tsx` | 마운트=열림 |
| `app/calendar/_components/EventDetailModal.tsx` | `open` prop |
| `app/calendar/_components/AddEventDispatcher.tsx` | `open` prop |
| `app/calendar/_pages/CalendarPage.tsx` | `detailOpen` — 모바일 바텀시트/데스크톱 사이드 패널 겸용 |
| `app/me/applications/_components/ApplyDetailModal.tsx` | inline style fixed |
| `app/me/applications/[applicationId]/_components/RespondAvailabilityModal.tsx` | inline style fixed |
| `components/report/ReportModal.tsx` | |
| `app/manage/clubs/[clubId]/fees/_components/BankReviewQueue.tsx` | 오버레이 2개 |
| `app/manage/clubs/[clubId]/fees/_components/BillList.tsx` | |
| `app/manage/clubs/[clubId]/fees/_components/PolicyList.tsx` | |
| `app/manage/clubs/[clubId]/fees/_components/FeeAccountSection.tsx` | |
| `app/manage/clubs/[clubId]/fees/_components/PaymentHistory.tsx` | 수제 오버레이(163행) — 같은 파일의 `<Dialog>` 는 래퍼가 커버 |
| `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` | 마감 확인 모달 |
| `app/clubs/[clubId]/_components/PhotoLightbox.tsx` | `DialogPrimitive.Root` 직접 사용 |
| `app/notices/_components/NoticeImageLightbox.tsx` | `DialogPrimitive.Root` 직접 사용 |

`CalendarPage` 의 `cal-detail` 은 데스크톱에서 사이드 패널로 뜬다. 뷰포트 분기 없이 그대로 적용한다
(데스크톱에서 뒤로가기로 패널이 닫히는 것은 허용). 미디어쿼리 분기는 훅에 뷰포트 의존성을 들여
복잡도만 늘린다.

## 엣지 케이스

| 상황 | 동작 |
| --- | --- |
| 시트 1개 + 뒤로 | 시트만 닫힘, 페이지 유지 |
| 중첩 2개 + 뒤로 | 최상단만 닫힘 → 다시 뒤로 → 아래 것 닫힘 → 다시 뒤로 → 페이지 이동 |
| 버튼/ESC/오버레이 탭으로 닫기 | 엔트리 회수(`history.back()`) → 뒤로가기 1회로 페이지 이동 |
| 중간 오버레이만 코드로 닫기 | 히스토리 무변경 → 그 엔트리는 죽은 엔트리 → 나중에 자동 스킵 |
| 3중 중첩에서 중간만 코드로 닫기 | 뒤로가기 1회 = 최상단만 닫힘. 죽은 엔트리를 지나며 판정을 보류하므로 아래 오버레이는 유지 |
| 시트 연 채 링크 이동 | 잔존 엔트리 발생 → 뒤로 시 착지 후 자동 스킵 → 이전 페이지로 정상 이동 |
| 닫기 거부(전송 중) | `onClose()` 무시됨 → 엔트리 재push, 시트 유지 |
| 뒤로 길게 눌러 여러 칸 점프 | 마커 없는 엔트리 착지 → 열린 오버레이 전부 닫힘 |
| Forward | 죽은 엔트리로 되돌아가더라도 URL 동일 → 화면 변화 없음 |
| 새로고침 / 딥링크 | URL 무변경 설계라 영향 없음 |
| StrictMode(dev) 이중 effect | 개발 모드의 effect 이중 실행에도 **최종 상태가 정상적으로 수렴**하도록 구현한다(ID 대조 가드). 전이 과정에서 여분 엔트리가 잠시 생길 수 있으나 URL 이 동일해 화면 영향은 없다 |

### 수용하는 한계 2건

1. **시트를 연 채 새로고침** — 새 문서는 그 잔존 엔트리 **위에서** 시작한다. 착지가 아니라
   "이미 그 위에 앉은" 상태라 스킵 로직이 닿지 않아 뒤로가기 1회가 먹힌다(같은 URL이라 화면 변화 없음).
   로드 시점에 `history.back()` 을 자동 호출하면 고칠 수 있으나, 판정이 틀리면 **매 페이지 로드마다
   히스토리를 조용히 한 칸 먹는** 훨씬 나쁜 실패 모드가 생긴다. 사용자 확정에 따라 **로드 시 자동
   히스토리 이동은 하지 않고**, `replaceState` 로 마커만 제거한 뒤 이 1회는 수용한다.
2. **닫으면서 동시에 페이지를 이동하는 경로**(알림 시트 항목 탭, admin/manage 드로어 메뉴 탭) —
   우리 `back()` 과 Next 의 `pushState` 커밋 순서가 뒤집히면 이전 페이지로 튕길 수 있다.
   동기 마커 가드(+마이크로태스크 재확인)로 대부분 차단되고, 가드에 걸리면 엔트리는 죽은 상태로
   남았다가 자동 스킵된다. Next 의 진행 중 내비게이션을 외부에서 관측할 방법이 없어 창을 0으로
   만들 수는 없다 — 실기기 QA 시나리오에 이 두 경로를 포함한다.

두 건 모두 `ponytail:` 주석으로 코드에 천장과 승급 경로를 명시한다.

## 접근성

- Radix 경유 오버레이는 포커스 트랩·복원·`aria-modal`·스크롤 잠금이 그대로다. 우리는 **닫기 경로를
  하나 추가할 뿐**이며, 닫기는 기존 `onOpenChange(false)` 와 동일 경로라 포커스 복원도 동일하게 탄다.
- 수제 오버레이도 기존 `onClose` 를 그대로 호출한다 — 각 컴포넌트가 이미 가진 복원 동작을 바꾸지 않는다.
- 닫기 실행을 마이크로태스크로 미루는 것은 같은 틱 내이므로 스크린리더 포커스 이동에 영향이 없다.

## 테스트

**단위 (`test/_lib/back-dismiss.test.tsx`, vitest + jsdom)**

- 단일 오버레이: 열림 시 엔트리 1개 push → `history.back()` → `onClose` 1회, 페이지 URL 불변
- 중첩 2개: 뒤로 1회에 최상단만 닫힘 → 2회째에 나머지
- 코드 닫기: 엔트리 회수 확인(뒤로 1회에 오버레이가 아니라 이전 엔트리로 이동)
- 중간 닫기 후 뒤로: 죽은 엔트리 자동 스킵으로 **죽은 뒤로가기 없음**
- 이전 문서 토큰 엔트리 착지: 자동 스킵
- 닫기 거부: `onClose` 무시 시 엔트리 재push 되어 두 번째 뒤로가기도 시트가 먹음
- 스킵 예산: 죽은 엔트리를 인위적으로 15개 쌓아도 back 호출이 10회로 제한
- 리스너: 여러 오버레이를 반복 열고 닫아도 `addEventListener('popstate')` 호출 1회

jsdom 의 traversal 구현이 불안정하면 `window.history` 를 스텁으로 대체한다(엔트리 배열 + 동기 back).
판정 로직 자체가 테스트 대상이므로 커버리지는 동일하다.

**컴포넌트**

- `ui/dialog`·`ui/sheet` 래퍼가 `open` 제어형 소비처에서 `onOpenChange(false)` 를 호출하는지
- 기존 시트/다이얼로그 테스트 전량 통과(회귀)

**실브라우저 (Playwright MCP, 로컬 :3000)**

- `/clubs` 필터 시트 열고 브라우저 뒤로 → 시트만 닫힘·URL 유지 → 다시 뒤로 → 이전 페이지
- 알림 시트에서 항목 탭(닫기+이동 동시 경로) → 이동 정상, 뒤로 → 원래 페이지

**실기기 체크리스트 (사용자 수행)**

Android Chrome 시스템 버튼 / Android Chrome 제스처 / iOS Safari 엣지 스와이프 / iOS Chrome /
PWA standalone — 각 환경에서 단일·중첩·코드 닫기 후 뒤로·드로어 메뉴 탭 이동.

## Out of Scope

- 드롭다운 메뉴·팝오버·콤보박스(`UserMenu`, `ClubSwitcher`, `SearchCombobox`, `MemberCsvDownloadPopover`,
  `FacilityContextBar`, `InfoNavLink` 퀵메뉴) — 뒤로가기 닫기 대상 아님
- 토스트·`BottomNav`·하단 고정 액션바 등 비모달 UI
- 오버레이 상태를 URL 쿼리로 옮기는 라우팅 리팩터링(딥링크 가능한 시트) — 별건
- 오버레이 열림 중 스크롤 잠금·포커스 트랩 동작 변경
- 백엔드 변경 없음, 마이그레이션 없음
