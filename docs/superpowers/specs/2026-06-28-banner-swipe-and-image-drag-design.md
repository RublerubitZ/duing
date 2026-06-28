# 메인 홈 배너 스와이프 + 이미지 드래그 다운로드 차단 설계

- 날짜: 2026-06-28
- 범위: 1개 PR (프론트엔드 전용, 백엔드 무변경)
- 대상 화면: `/` (홈) 메인 프로모션 배너 (`BannerCarousel`)

## 목표

- 배너 이미지를 **마우스로 끌면 PNG 파일로 다운로드**되는 현상을 차단한다.
- **마우스·터치·펜 모두에서 스와이프로 배너를 넘길 수 있게** 한다(현재는 터치만 동작, PC 마우스는 불가).
- 스와이프는 **"약한 드래그 피드백(peek) + 임계 거리/속도 판정 + 부드러운 복귀"** 구조로 조작감만 끌어올리되, **기존 키프레임 전환·오토플레이·무한 루프·버튼/점 네비게이션은 그대로 유지**한다. 라이브-드래그 캐러셀로 전체를 재작성하지 않는다.
- 백엔드·API·데이터 변경 없이 프론트 표현 계층만 수정한다.

---

## 배경 (현재 구현)

- 라이브러리 없는 커스텀 캐러셀. `BannerCarouselClient.tsx` 가 상태(`activeIndex`/`isPlaying`/`direction`/`exitingSlide`)와 네비게이션을, `banner/FullBleedSlide.tsx`·`banner/SystemComposedSlide.tsx` 가 슬라이드 렌더링을 담당.
- 전환은 Tailwind 키프레임. 이동 시 `exitingSlide`(나가는 슬라이드)에 `animate-slide-out-*`, 들어오는 슬라이드에 `animate-slide-in-*` 를 입히고 `SLIDE_DURATION_MS(400ms)` 뒤 `exitingSlide` 를 비운다.
- 스와이프는 컨테이너의 `onTouchStart`/`onTouchEnd` 로 **터치만** 처리(40px 임계, 라이브 피드백 없음). 오토플레이 5s, `goNext`/`goPrev` 는 모듈러로 무한 순환.
- 배너 이미지는 모두 일반 `<img>`. `draggable` 미설정.

---

## 결정 사항

### 이미지 드래그 다운로드 차단

- **4개 `<img>` 전부에 `draggable={false}`.** 마우스 드래그 시 발동하는 브라우저 네이티브 이미지 드래그를 끈다.
- **실제 원인은 `FullBleedSlide` 의 커버 이미지**(`FullBleedSlide.tsx:42` 메인, `:100` 프리뷰) — 보호장치가 전혀 없어 마우스로 끌면 그대로 다운로드된다.
- **`SystemComposedSlide` 이미지**(`:64`, `:197`)는 이미 `pointer-events-none` 이라 마우스가 잡지 못해 드래그가 시작되지 않지만, **일관성·방어 차원에서 동일하게 `draggable={false}` 를 박는다.**
- `pointer-events-none` 만으로는 불충분하다는 점이 핵심(마우스가 닿는 FullBleed 가 범인). 정렬 영역 `<img>` 에 `draggable=false` 를 강제했던 기존 사진 정렬 패턴과 같은 결.

### 스와이프 — Pointer Events 통일

- **`onTouchStart`/`onTouchEnd` 를 제거하고 `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` 로 단일화.** 마우스·터치·펜을 한 코드로 처리하고, 터치+포인터 이중 발화로 인한 더블 전환을 원천 차단한다.
- **방향 의도 락(스크롤 충돌 방지).** pointerdown 이후 이동량이 가로 우세(`|dx| > |dy|`)이고 활성 임계(`DRAG_ACTIVATE_PX = 8`)를 넘을 때만 가로 드래그로 확정한다. 세로 우세면 드래그를 포기해 페이지 스크롤에 양보한다. 컨테이너의 기존 `touch-pan-y`(= `touch-action: pan-y`)와 짝을 맞춘다 — 세로 팬은 브라우저, 가로는 우리가 가져간다.
- **Pointer Capture.** pointerdown 에서 `setPointerCapture(e.pointerId)`(`pointerIdRef` 에 저장), pointerup/pointercancel 에서 release. release 는 **`pointerIdRef.current !== null` 이고 `el.hasPointerCapture(pointerIdRef.current)` 일 때만** 호출하고, 호출 뒤 `pointerIdRef = null` 로 비운다(이중 release·없는 ID release 방지). 빠르게 컨테이너 밖으로 끌어도 move/up 이 유실되지 않고 드래그 상태가 남지 않는다.
- **컨테이너 너비 고정.** pointerdown 시점에 `containerRef.getBoundingClientRect().width` 를 ref 에 저장하고, 커밋 임계 거리는 이 값으로만 계산한다. 드래그 중 resize/회전이 일어나도 판정이 흔들리지 않는다.
- **약한 드래그 피드백(peek).** 드래그 중 활성 슬라이드를 `translateX(dx × DRAG_DAMPING)`(`DRAG_DAMPING = 0.25`, 약 25%)만 따라오게 하고 그동안 `transition: none`. 이동을 댐핑으로 제한해 "끌고 있다"는 피드백만 주고 과하게 따라오지 않게 한다.
- **종료 판정(거리 또는 속도).** 드래그 종료 시 `|dx| ≥ 고정너비 × COMMIT_RATIO`(`COMMIT_RATIO = 0.30`) **또는** 플릭 속도 `|velocity| ≥ FLICK_VELOCITY`(`event.timeStamp` 기반, `px/ms`)면 커밋, 아니면 복귀. `dx < 0 → goNext`, `dx > 0 → goPrev`.
- **커밋은 기존 키프레임 전환 그대로.** `goNext`/`goPrev` 를 호출해 `animate-slide-*` 전환을 재사용한다.
- **복귀(임계 미달).** peek 를 0으로 부드럽게 되돌린다 — `transition: transform 250ms ease-out`(**transform 한정**, `all` 금지).
- **클릭 억제.** 메인 슬라이드는 `<a>`/`<Link>` 로 감싸여 있어 드래그 종료 뒤 따라오는 `click` 이 링크 이동을 일으킬 수 있다. 드래그가 실제 발생했으면(`didDragRef`) 컨테이너의 `onClickCapture` 에서 `preventDefault()` + `stopPropagation()` 으로 막는다. 단순 탭(이동량 < 활성 임계)은 막지 않아 배너 클릭 이동은 정상 유지.
- **오토플레이 재개 지연.** 드래그 시작~애니메이션 종료까지 오토플레이를 멈춘다. `isDragging` 과 `isSettling` 플래그를 오토플레이 effect 가드에 추가(`if (!isPlaying || isDragging || isSettling || slides.length <= 1) return;`)하고, pointerup **즉시 재개하지 않고** 복귀(250ms)/전환(400ms) 애니메이션이 끝난 뒤 `isSettling` 을 풀어 재개한다. 사용자의 재생/정지 토글(`isPlaying`)은 건드리지 않는다.

### peek → 커밋 이음새 (점프 제거)

순진하게 커밋 순간 peek 를 0으로 리셋하면, 키프레임이 `translateX(0)` 에서 시작하므로 끌던 방향과 **반대로 튕기는 점프**가 보인다(peek 가 댐핑돼도 폭의 수 %라 눈에 띈다).

이를 없애기 위해 나가는/들어오는 슬라이드 두 장을 감싸는 **안정적인 `track` 래퍼**를 한 겹 둔다(키 변경으로 remount 되는 슬라이드 래퍼와 달리 track 은 마운트 유지).

- **드래그 중:** track 에 peek(`translateX(dx × 0.25)`, `transition: none`) 적용.
- **커밋 시:** track 을 `0` 으로 `transform 400ms`(키프레임 `SLIDE_DURATION_MS` 와 동기) 전환시키면서, 안쪽 슬라이드는 기존 키프레임으로 in/out. 두 변위가 합산돼 **역방향 점프 없이 한 방향으로** 매끄럽게 이어진다.
- **복귀 시:** track 만 `0` 으로 `transform 250ms ease-out`.
- **드래그가 없을 때(버튼·점·오토플레이):** track 은 `translateX(0)` · `transition: none` 으로 완전 무동작 → 기존 전환 동작 100% 보존.

peek 동안 track 이 밀리면 가장자리에 슬라이드 배경 너머의 옅은 여백이 잠깐 보이는데, "현재 배너만 따라온다"는 의도에 부합하며 댐핑으로 폭이 작아 허용한다(다음 슬라이드 미리보기는 비범위).

---

## 구현 설계 (`BannerCarouselClient.tsx` 수정)

### 추가 상수

```
const DRAG_ACTIVATE_PX = 8;     // 가로 드래그 확정 임계
const DRAG_DAMPING = 0.25;      // peek 비율(20~30%) — 초기값, 시각 QA 로 최종 조정
const COMMIT_RATIO = 0.30;      // 커밋 거리 임계(고정너비 대비) — 초기값, 시각 QA 로 최종 조정
const FLICK_VELOCITY = 0.5;     // 커밋 속도 임계(px/ms) — 초기값, 시각 QA 로 최종 조정
const SETTLE_DURATION_MS = 250; // 복귀 transition
// 커밋 track 복귀는 기존 SLIDE_DURATION_MS(400) 재사용
```

> `DRAG_DAMPING`·`COMMIT_RATIO`·`FLICK_VELOCITY` 는 감각 상수다. 위 값은 **초기값**이며, 구현 후 PC/태블릿/모바일 배율 시각 QA 로 손맛을 보고 최종 조정한다(구현자는 이 값에 묶이지 말 것).

### 상태 / ref

- 신규 state: `dragOffset`(px, track 변위), `isDragging`, `isSettling`, `settleMs`(복귀 250 / 커밋 400 구분 — track transition 지속시간).
- 신규 ref: `containerRef`(너비 측정), `pointerIdRef`, `pointerStartRef({x,y,time})`, `lockedRef`('none'|'horizontal'|'vertical'), `didDragRef`, `containerWidthRef`, `settleTimerRef`.
- 기존 `touchStartXRef` 및 `handleTouchStart`/`handleTouchEnd` 제거.

### 핸들러 흐름

- `onPointerDown(e)`: `pointerStartRef = {x,y,time: e.timeStamp}`, `containerWidthRef = containerRef.getBoundingClientRect().width`, `pointerIdRef = e.pointerId`, `setPointerCapture`. `lockedRef='none'`, `didDragRef=false`. **진행 중 복귀가 있으면(re-grab):** `settleTimerRef` clear 하고, track 의 **현재 computed translateX 를 읽어**(`new DOMMatrixReadOnly(getComputedStyle(track).transform).m41`) `setDragOffset(현재값)` 로 시드한 뒤 `setIsSettling(false)` 로 transition 을 끊는다 → 화면상 transform 위치 그대로, **점프 없이** 이어받는다. (state 의 `dragOffset` 은 복귀 시작 때 이미 0 으로 설정돼 있어, 시드 없이 끊으면 0 으로 튄다 — 그래서 computed 값 시드가 필요하다.)
- `onPointerMove(e)`: 슬라이드 1장 이하면 무시. `dx=e.clientX-startX`, `dy=e.clientY-startY`.
  - `lockedRef==='none'`: `max(|dx|,|dy|) > DRAG_ACTIVATE_PX` 일 때 가로/세로 우세로 락. 세로면 종료 처리(스크롤 양보).
  - `lockedRef==='horizontal'`: `didDragRef=true`, `setIsDragging(true)`, `setDragOffset(dx * DRAG_DAMPING)`, `e.preventDefault()`.
- **공통 teardown `endDrag(shouldCommit, dir?)`:** release capture(위 가드), `pointerIdRef=null`, `pointerStartRef=null`, `lockedRef='none'`, `setIsDragging(false)`.
  - 커밋(`shouldCommit`): `setSettleMs(SLIDE_DURATION_MS)`, `setIsSettling(true)`, `setDragOffset(0)`, `dir < 0 ? goNext() : goPrev()`, `settleTimerRef` 로 `SLIDE_DURATION_MS` 뒤 `setIsSettling(false)`.
  - 복귀(else): `setSettleMs(SETTLE_DURATION_MS)`, `setIsSettling(true)`, `setDragOffset(0)`, `settleTimerRef` 로 `SETTLE_DURATION_MS` 뒤 `setIsSettling(false)`.
  - `didDragRef` 는 teardown 에서 건드리지 않는다 — pointerup 뒤따르는 click 캡처가 소비/리셋해야 링크 이동이 억제된다.
- `onPointerUp(e)`: 가로 락이었으면 `dx`, `velocity = dx / (e.timeStamp - startTime)` 계산 → `|dx| ≥ containerWidthRef*COMMIT_RATIO || |velocity| ≥ FLICK_VELOCITY` 면 `endDrag(true, dx)`, 아니면 `endDrag(false)`. 가로 락이 아니었으면(탭/세로) `endDrag(false)`.
- `onPointerCancel(e)`: **제스처 중단 → 항상 commit 없이** `endDrag(false)` 로 원위치 복귀하고, 이어서 **`isDragging`·`isSettling` 라이프사이클·`dragOffset`·`didDragRef`·`lockedRef`·`pointerIdRef`·`pointerStartRef` 등 모든 드래그 상태를 pointerup 과 동일하게 idle 로 정리**한다. cancel 뒤엔 click 이 따라오지 않으므로 `didDragRef = false` 를 **직접** 리셋(click 캡처가 소비할 일이 없음).
- `onClickCapture(e)`: `didDragRef` 가 true 면 `e.preventDefault(); e.stopPropagation();` 후 `didDragRef=false`.

### 마크업 변경

- 캐러셀 컨테이너에 `ref={containerRef}` + 포인터/클릭 핸들러. 기존 `touch-pan-y select-none` 유지.
- 기존 `exitingSlide` 래퍼 + 활성 슬라이드 래퍼 **두 장을 `track` div 로 감싼다.** track: `absolute inset-0`, `style={{ transform: translateX(${dragOffset}px), transition: isSettling ? 'transform ${settleMs}ms ease-out' : 'none' }}`. (드래그 중·idle 은 `none`, 복귀/커밋 동안만 `settleMs` 전환 — 커밋은 안쪽 키프레임과 동기로 400ms, 복귀는 250ms.) 화살표 버튼·점 인디케이터는 track **밖**(컨테이너 직계)에 그대로 둬 드래그 시 움직이지 않게 한다.
- **(권장) `will-change: transform`** 으로 track 을 GPU 합성 레이어로 승격해 peek/복귀 transform 을 부드럽게 한다. 상시 승격의 메모리 비용을 피하려면 **드래그/복귀 중(`isDragging || isSettling`)에만** `will-change: 'transform'`, idle 엔 `'auto'` 로 두는 게 이상적이다.
- 오토플레이 effect 가드에 `isDragging || isSettling` 추가, 의존성 배열에 두 값 포함.
- 언마운트 cleanup 에 `settleTimerRef` clear 추가.

### 슬라이드 파일 변경

- `FullBleedSlide.tsx`: 메인(`:42`)·프리뷰(`:100`) `<img>` 에 `draggable={false}`.
- `SystemComposedSlide.tsx`: 메인(`:64`)·프리뷰(`:197`) `<img>` 에 `draggable={false}`.

---

## 변경 지점

- **수정** `apps/web/app/_components/sections/BannerCarouselClient.tsx` — 터치 핸들러 → Pointer Events 드래그(peek·임계/속도·복귀·클릭억제·포인터캡처·너비고정), `track` 래퍼 추가, 오토플레이 가드에 `isDragging`/`isSettling` 반영.
- **수정** `apps/web/app/_components/sections/banner/FullBleedSlide.tsx` — `<img>` 2곳 `draggable={false}`.
- **수정** `apps/web/app/_components/sections/banner/SystemComposedSlide.tsx` — `<img>` 2곳 `draggable={false}`.
- `BannerCarousel.tsx`(서버), 데이터/타입(`home-data.ts`/`promotion.ts`)은 **무변경**.

---

## 테스트

`apps/web/test/sections/banner/` 에 슬라이드 렌더러 테스트는 있으나 **캐러셀 클라이언트(스와이프) 테스트는 없다.** 포인터 시뮬레이션은 `test/notices/notice-content.test.tsx`(`fireEvent.pointerDown/Up` + `clientX/clientY`) 패턴을 따른다.

- **신규** `test/sections/banner/banner-carousel-client.test.tsx` (2장 이상 슬라이드로 렌더)
  - 가로 드래그가 커밋 거리 임계를 넘으면(`pointerDown 0,0 → move -300,0 → up`) 다음 슬라이드로 전환(`01/0N → 02/0N` 또는 활성 점 이동으로 검증).
  - 반대 방향 드래그면 이전 슬라이드로 전환(무한 루프: 첫 슬라이드에서 우→ 마지막).
  - 임계 미달 드래그(`move -10,0`)면 전환 없이 현 슬라이드 유지(복귀).
  - 세로 우세 제스처(`move 0,-200`)는 전환을 일으키지 않는다(방향 락=스크롤 양보).
  - 드래그 후 발생한 링크 클릭이 억제된다(`onClickCapture preventDefault` — 드래그 시 `defaultPrevented` 검증, 단순 탭은 비억제).
  - 슬라이드 1장이면 포인터 드래그가 무시된다.
  - 플릭(속도) 커밋은 jsdom 의 `timeStamp` 제약으로 **시각 QA 로 확인**(단위테스트는 거리 임계 중심).
- **보강** `test/sections/banner/full-bleed-slide.test.tsx`, `system-composed-slide.test.tsx`
  - 렌더된 `<img>` 의 `draggable` 속성이 `false` 임을 단언.
- **시각 QA** (`pnpm dev`, :3000): PC(마우스 드래그)·태블릿·모바일 배율에서 (1) 이미지 드래그 시 다운로드 미발생, (2) 스와이프 전환·peek·복귀 자연스러움, (3) 세로 스크롤 정상, (4) 오토플레이가 드래그 종료 애니메이션 후 재개. 확인 후 dev 서버 종료.

---

## 리뷰 강도

- FE 표현 계층(상호작용) 단독 변경 — 권한·상태전이·동시성·자동배정·데이터무결성·Migration·API contract 해당 없음 → 기본 리뷰(`duing-code-reviewer` + `codex:review`)로 충분. adversarial-review 불요.
- 리뷰 중점: 포인터 핸들러가 링크/버튼 기본 동작·페이지 스크롤을 부당히 가로채지 않을 것, 터치+포인터 이중 발화가 없을 것, settle/commit 타이머·포인터캡처가 언마운트/중단 시 누수 없이 정리될 것.

---

## Out of Scope

- 전체 라이브-드래그 캐러셀 재작성(슬라이드가 손가락을 100% 따라오는 구조).
- 드래그 중 **다음 슬라이드 미리 보이기**(현재 배너만 따라오는 peek — 가장자리 여백은 의도된 동작).
- 키보드 화살표 네비게이션 **신규 추가**(기존 버튼/점 포커스 접근성만 유지).
- 오토플레이 간격·무한 루프 로직·비주얼·반응형 브레이크포인트 변경.
- `prefers-reduced-motion` 특수 처리(기존 키프레임과 동일 기준 유지).
- 백엔드·API·데이터·타입 변경, `next/image` 전환.
