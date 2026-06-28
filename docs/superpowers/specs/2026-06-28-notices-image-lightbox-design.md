# 공지 상세 이미지 확대(라이트박스) 설계

- 날짜: 2026-06-28
- 범위: 1개 PR (프론트엔드 전용, 백엔드 무변경)
- 대상 화면: `/notices/[noticeId]` 공지 상세 페이지

## 목표

- 공지 상세에서 **커버 이미지**와 **본문 이미지**를 클릭하면 전체화면 라이트박스로 크게 볼 수 있게 한다.
- 기존 동아리 활동사진 라이트박스(`PhotoLightbox`)의 a11y·모션 패턴(Radix Dialog·포커스 트랩·ESC·스크롤 잠금·`useReducedMotion`)을 본떠 일관성을 유지하되, 공지는 **단일 이미지 보기**라 갤러리 요소(좌우 전환·카운터)는 두지 않는다.
- 백엔드·API·데이터 변경 없이 프론트 표현 계층만 추가한다.

---

## 결정 사항

- **단일 이미지 확대.** 클릭한 이미지 하나만 띄우고 닫으면 본문으로 복귀한다. 커버+본문 이미지를 한 묶음으로 좌우 전환하지 않는다(공지는 사진첩이 아니라 글).
- **확대 깊이는 화면맞춤(`object-contain`)까지.** 핀치/휠 배율 줌은 넣지 않는다.
- **상태는 `image` 단일 객체로 관리.** `image: { src: string; alt?: string } | null`. 추후 `width`/`height`/`blurDataURL` 등을 더해도 prop 시그니처를 바꾸지 않고 확장 가능. 라이트박스 열림 여부는 `image !== null` 에서 파생한다(별도 `open` prop 없음).
- **닫기 경로 4종(모두 v1 포함):** 닫기 버튼(우상단 X) · ESC · 배경 클릭 · 모바일 아래로 스와이프.
- **배경 클릭 닫기는 "backdrop 에서 시작된 클릭"만.** 이미지를 드래그하거나 이미지를 클릭하다 배경에서 손을 떼는 경우 닫히지 않는다. → `pointerdown` 의 타깃이 backdrop 컨테이너 자신일 때만 닫기 후보로 표시하고, 이어지는 `click` 타깃도 컨테이너 자신일 때만 `onClose`.
- **아래로 스와이프 닫기는 거리 또는 속도 기준.** 드래그 종료 시 아래 방향 이동량이 임계 거리 이상이거나 아래 방향 플릭 속도가 임계 속도 이상이면 닫는다. 조건 미달이면 `dragSnapToOrigin` 으로 원위치 복귀. 위로 스와이프는 닫지 않는다. `useReducedMotion` 시 탄성 0.
- **본문 이미지는 포인터 클릭만.** 본문은 `dangerouslySetInnerHTML`(HTML) 또는 `react-markdown`(MARKDOWN)으로 주입되어 각 `<img>` 를 React 핸들러나 `<button>` 으로 감쌀 수 없다. 컨테이너 **클릭 이벤트 위임**으로 처리하고 키보드 트리거는 v1 범위 밖으로 둔다. 단, **커버 이미지는 진짜 `<button>`** 이라 키보드 접근이 되고, 라이트박스가 열린 뒤엔 Radix 가 포커스 트랩·ESC 등 풀 a11y 를 보장한다.
- **본문 위임은 Pointer 이벤트 기반.** `onClick` 대신 `onPointerDown`/`onPointerUp` + **이동량(slop) 검사**로 탭만 잡는다 — 모바일에서 이미지 위에서 시작한 스크롤 제스처가 클릭으로 오인되어 확대되는 충돌을 줄인다. 시작 좌표 대비 이동량이 `TAP_SLOP(10px)` 미만이고 같은 `<img>` 위에서 끝난 경우만 확대.
- **`<a>` 로 감싼 본문 이미지는 확대 우선.** 링크 안의 이미지를 탭하면 라이트박스를 열고, 앵커 기본 이동은 별도 `onClickCapture` 에서 이미지 타깃일 때 `e.preventDefault()` 로 막는다(여는 동작은 pointerup, 이동 차단은 click 캡처로 책임 분리). 링크로 따라가야 하는 이미지가 필요한 경우는 드물고 본 기능의 명시 목적이 "탭=확대"라 이 트레이드오프를 택한다.

---

## 컴포넌트 설계

### 1) 신규 — `notices/_components/NoticeImageLightbox.tsx` (`'use client'`)

단일 이미지 전체화면 라이트박스. `PhotoLightbox` 의 Radix 구조를 차용하되 갤러리 로직을 제거한다.

- **공개 타입:** `export type NoticeImage = { src: string; alt?: string }` — 커버/본문 양쪽이 공유한다(확장 지점).
- **props:** `{ image: NoticeImage | null; onClose: () => void }`
- **열림 파생:** `const open = image !== null`. Radix `Root` 는 항상 마운트하고 `open` 으로 제어, `onOpenChange(next)` 가 `false` 면 `onClose()`(ESC·닫기버튼 경로를 한 곳으로 모음).
- **닫는 동안 이미지 유지:** 부모가 `image` 를 `null` 로 바꾸면 즉시 src 가 사라져 닫힘 페이드가 끊긴다. `useRef` 로 마지막 비-null 이미지를 렌더 중 보관(`if (image) lastRef.current = image; const shown = image ?? lastRef.current;`)해 닫힘 트랜지션 프레임을 유지한다(useEffect 없이 파생 — 기존 `ImageWithFallback` 의 derived-state 관례와 동일 결). `shown` 이 없으면(최초·미오픈) `null` 반환.
- **레이아웃:** Radix `Overlay`(`bg-ink-deep/95 backdrop-blur-sm` + open/closed 페이드) + `Content`(`fixed inset-0 z-[70] flex flex-col`). `sr-only` `Title`("이미지 크게 보기"). 상단 바에 닫기 버튼(`@/components/duing/Icon` 의 `X`), 그 아래 `flex-1` 이미지 영역.
- **드래그 캐리어는 `motion.div` 래퍼.** 드래그를 `motion.img` 가 아닌 **이미지를 감싼 `motion.div`** 에 건다(드래그 영역이 안정적이고 추후 확장 용이). 래퍼: `drag` + `dragSnapToOrigin` + `dragConstraints={{left:0,right:0,top:0,bottom:0}}` + `dragElastic={reduceMotion ? 0 : 0.25}` + `onDragEnd`. 진입 페이드도 래퍼에: `initial={reduceMotion ? false : { opacity: 0.4 }} animate={{ opacity: 1 }}`. 래퍼는 `touch-none select-none` 로 드래그 중 스크롤/선택 방지.
- **이미지:** 래퍼 안의 일반 `<img>`(`object-contain max-h-full max-w-full`), `draggable={false}`, 테스트 앵커 `data-testid="notice-lightbox-image"`.
- **스와이프 닫기:** 래퍼의 `onDragEnd(_e, info)` 에서 `info.offset.y >= SWIPE_CLOSE_THRESHOLD(120)` 또는 `info.velocity.y >= SWIPE_CLOSE_VELOCITY(500)` 이면 `onClose()`.
- **배경 클릭 닫기:** 이미지 영역 컨테이너에
  - `onPointerDown={(e) => { backdropDown.current = e.target === e.currentTarget; }}`
  - `onClick={(e) => { if (backdropDown.current && e.target === e.currentTarget) onClose(); }}`
  - 이미지는 컨테이너의 자식이라 이미지에서 시작한 포인터다운/클릭은 `e.target !== e.currentTarget` 이 되어 닫히지 않는다.

### 2) 수정 — `notices/_components/NoticePosterHero.tsx` (`'use client'` 추가)

- 자체 `const [zoomed, setZoomed] = useState<NoticeImage | null>(null)` 보유.
- 커버가 **있을 때만**(`coverImageUrl` 비어있지 않음) `ImageWithFallback` 을 `<button type="button">` 으로 감싼다. 버튼: 기존 프레임 클래스(`aspect-[3/4] w-full rounded-lg overflow-hidden border border-line shadow-2`) + `cursor-zoom-in` + 포커스 링(`focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink`), `aria-label={`${title} 대표 이미지 크게 보기`}`. 클릭 시 `setZoomed({ src: coverImageUrl, alt: title })`. `ImageWithFallback` 은 `className="w-full h-full"` 로 버튼을 채움.
- 커버가 **없으면** 기존 플레이스홀더 그대로(버튼 없음 → 클릭 불가).
- 하단에 `<NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />` 렌더. 레이아웃 grid 래퍼는 유지.

### 3) 수정 — `notices/_components/NoticeContent.tsx` (`'use client'` 추가)

- 자체 `const [zoomed, setZoomed] = useState<NoticeImage | null>(null)` 보유.
- 본문(HTML `div` 또는 `NoticeMarkdown`)을 **Pointer 위임 컨테이너**로 감싼다. 컨테이너에 `[&_img]:cursor-zoom-in` 부여 → HTML·마크다운 본문 이미지 모두 확대 커서. (`NoticeMarkdown` 은 건드리지 않는다.)
- 탭 판정용 `const tapStart = useRef<{ x: number; y: number; img: HTMLImageElement } | null>(null)`:
  - `onPointerDown(e)`: `e.target instanceof HTMLImageElement` 이면 `tapStart.current = { x: e.clientX, y: e.clientY, img: e.target }`, 아니면 `null`.
  - `onPointerUp(e)`: `tapStart.current` 가 있고 `e.target === tapStart.current.img` 이며 `Math.hypot(e.clientX - x, e.clientY - y) <= TAP_SLOP(10)` 이면 `setZoomed({ src: img.currentSrc || img.src, alt: img.alt })`. 처리 후 `tapStart.current = null`.
  - `onClickCapture(e)`: `e.target instanceof HTMLImageElement` 이면 `e.preventDefault()` — `<a><img></a>` 앵커 이동 차단(여는 책임은 pointerup, 이동 차단 책임은 click 캡처로 분리).
- 본문 이미지는 `touch-none` 을 주지 않는다(페이지 스크롤 보존). 스크롤 vs 탭 구분은 slop 검사가 담당.
- 하단에 `<NoticeImageLightbox image={zoomed} onClose={() => setZoomed(null)} />` 렌더.
- 기존 `PROSE_CLASS` 와 sanitize 경로(`sanitizeNoticeHtml`)는 그대로 유지. 위임 컨테이너는 시각적 영향이 없도록 wrapper `div` 로만 감싼다.

---

## 변경 지점

- **신규** `apps/web/app/notices/_components/NoticeImageLightbox.tsx` — 단일 이미지 라이트박스 + `NoticeImage` 타입 export.
- **수정** `apps/web/app/notices/_components/NoticePosterHero.tsx` — `'use client'`, 커버 버튼화 + 라이트박스 연결.
- **수정** `apps/web/app/notices/_components/NoticeContent.tsx` — `'use client'`, 본문 포인터(탭) 위임 + 라이트박스 연결 + 확대 커서.
- `[noticeId]/page.tsx`, `NoticeMarkdown.tsx`, `sanitizeHtml.ts` 는 **무변경**.

---

## 테스트

기존 `apps/web/test/clubs/photo-lightbox.test.tsx` 패턴(Radix Dialog·`motion.*` 컴포넌트가 vitest/jsdom 에서 정상 렌더, `getByRole`/`fireEvent`/`userEvent` 사용)을 따른다.

- **신규** `test/notices/notice-image-lightbox.test.tsx`
  - `image` 가 있으면 해당 `src` 의 이미지와 닫기 버튼을 렌더한다.
  - `image={null}` 이면 이미지·닫기 버튼을 렌더하지 않는다.
  - 닫기 버튼 클릭 → `onClose` 호출.
  - 배경(컨테이너) 클릭 → `onClose` 호출. 이미지 클릭은 `onClose` 미호출(타깃 게이팅 검증).
- **보강** `test/notices/notice-content.test.tsx` (탭은 `fireEvent.pointerDown` → `pointerUp` 동일 좌표로 시뮬레이션 — slop 0 통과)
  - 본문 이미지 여러 장(HTML 포맷, `<img src=a alt=A><img src=b alt=B>`)에서: 첫 번째 이미지 탭 → 라이트박스가 `a` 이미지로 열림 → 닫기 → 두 번째 이미지 탭 → 라이트박스가 `b` 이미지로 열림(이미지 상태 전환 검증). 라이트박스 이미지는 `data-testid="notice-lightbox-image"` 로 조회.
  - 본문 이미지 아닌 영역(텍스트) 탭 시 라이트박스가 열리지 않음.
  - 같은 이미지에서 시작했어도 이동량이 slop 초과(`pointerDown` 0,0 → `pointerUp` 200,200)면 열리지 않음(스크롤 제스처 구분).
  - `<a><img></a>` 구조에서 이미지 탭 시 라이트박스가 열림(앵커 이동 대신 확대 — `onClickCapture` `preventDefault` 검증).
- **신규** `test/notices/notice-poster-hero.test.tsx`
  - 커버가 있으면 "크게 보기" 버튼 클릭 → 라이트박스가 커버 `src` 로 열림.
  - 커버가 없으면(`coverImageUrl=''`) 확대 버튼이 없다(클릭 불가).

---

## 리뷰 강도

- FE 표현 계층 단독 변경(권한·상태전이·동시성·자동배정·데이터무결성·Migration·API contract 해당 없음) → 기본 리뷰(`duing-code-reviewer` + `codex:review`)로 충분. adversarial-review 불요.
- 단, **본문 HTML 주입 + 포인터 위임**이 보안 표면이라 리뷰 중점: sanitize 경로(`sanitizeNoticeHtml`)를 우회/약화하지 않을 것, 위임이 `<img>` 외 요소(링크 등)의 기본 동작을 부당하게 가로채지 않을 것.

---

## Out of Scope

- 목록 페이지(`/notices`) 카드·행 썸네일 확대.
- 관리자(`/admin/notices`) 및 동아리 멤버 공지 화면.
- 핀치/휠 배율 줌, 좌우 갤러리 넘기기(커버↔본문 순회), 캡션·카운터.
- 본문 이미지의 키보드 트리거(접근성 완전 키보드화) — 주입 HTML 한계로 v1 제외.
- 백엔드/`sanitizeHtml` allowlist 변경, `next/image` 전환.
