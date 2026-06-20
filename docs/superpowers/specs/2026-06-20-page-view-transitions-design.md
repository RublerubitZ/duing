# 페이지 전환 애니메이션 (View Transitions) — 설계서

- 날짜: 2026-06-20
- 메커니즘: **View Transitions API** (`next-view-transitions@0.3.5`)
- 채택: 전역 최소 크로스페이드 + 핵심 동선 1곳 공유요소 모핑

## 배경 / 목표

페이지 이동 시 즉시 점프해 다소 딱딱한 인상을 준다. 차분한 폴리시로 (1) 전역 페이지 전환에
**최소한의 크로스페이드**를 깔고, (2) **동아리 목록 → 상세** 한 동선에 로고가 이어지는 **공유요소 전환**을
더해 공간적 연속성을 준다. 과업 흐름을 막지 않도록 짧고(≤200ms) 절제되게, `prefers-reduced-motion` 을 존중한다.

## 왜 View Transitions API 인가

- 공유요소 모핑은 브라우저 네이티브 VT 가 유일하게 깔끔하다. framer-motion `AnimatePresence` exit 는
  App Router 에서 잰크(콘텐츠 깜빡임·스크롤 리셋)가 심하고, `template.tsx` 페이드는 VT 와 동시 실행 시 충돌.
- `next-view-transitions` 가 App Router 클라이언트 네비게이션을 `document.startViewTransition` 으로
  올바르게(비동기 RSC 네비 완료까지 대기) 감싼다. 직접 구현 시 타이밍 때문에 모핑이 깨진다.
- 미지원 브라우저(예: Firefox)는 라이브러리가 그냥 즉시 이동시키므로 **graceful 폴백**.

## 구현

### 1) 전역 최소 크로스페이드
- `app/layout.tsx` 를 `<ViewTransitions>` 로 감싼다.
- 주요 네비게이션 표면(`HomeNav`·`ExploreNav`·`BottomNav`)의 `next/link` 를 `next-view-transitions` 의 `Link` 로 교체 → 해당 이동이 startViewTransition 경유 → 루트 크로스페이드.
- `globals.css` 에서 VT 의사요소 지속시간/이징을 차분하게(≈180ms) 튜닝. 기본 동작(루트 페이드)을 그대로 사용.

### 2) 공유요소 모핑 (clubs 목록 → 상세)
- 동아리 **로고 박스**는 `ClubCard`(카드)와 `ClubDetailHero`(상세 히어로, 데스크톱·모바일)에 동일하게 존재.
- 양쪽 로고 박스에 `view-transition-name: club-logo-${id}` 부여 → 클릭 시 로고가 카드에서 히어로로 모핑.
- `ClubCard` 의 `Link` 도 `next-view-transitions` 로 교체(모핑은 startViewTransition 경유 이동에서만 동작).
- 한 페이지 안에서 같은 club id 는 한 번만 렌더되어 name 이 유일(목록/홈 featured 각각 유일). 상세 히어로는 데스크톱/모바일이 뷰포트 배타라 동시 노출 안 됨 → 유일 보장. (만일 중복되면 VT 가 해당 모핑만 폴백, 크래시 없음)

### 3) 접근성 / CLS
- `@media (prefers-reduced-motion: reduce)` 에서 모든 VT 의사요소 `animation: none` → 즉시 전환.
  (framer-motion 은 기존 `MotionConfig reducedMotion="user"` 로 별도 처리됨)
- 크로스페이드/모핑은 합성(transform·opacity)만 사용 → 레이아웃 시프트 없음.

### 4) 테스트 호환
- `next-view-transitions` 의 `Link` 는 `<ViewTransitions>` 컨텍스트 없으면 렌더 시 throw → jsdom 단위 테스트가 깨진다.
- `test/setup.ts` 전역 모킹으로 `Link`→일반 anchor, `ViewTransitions`→passthrough 대체(실제 전환은 브라우저에서만).

## 변경 파일
- `package.json` (+`next-view-transitions`)
- `app/layout.tsx`, `app/globals.css`, `test/setup.ts`
- `app/_components/{HomeNav,ExploreNav,BottomNav}.tsx`
- `app/clubs/_components/ClubCard.tsx`, `app/clubs/[clubId]/_components/ClubDetailHero.tsx`

## Out of Scope
- manage/admin 내부 링크, 모달·시트 전환, 뒤로/앞으로 방향성 슬라이드.
- 로고 외 이미지/요소 공유 전환, clubs 외 동선의 공유요소.
- `HomeNav` 하위 위젯(알림 벨·인증 슬롯·admin 링크)의 Link 교체.
- 전환 사운드/햅틱, 라우트별 커스텀 전환.

## 검증
- typecheck / lint / test / build 통과 + `ClubCard` 의 `view-transition-name` 부여 단위 테스트.
- 전역 크로스페이드는 정적 페이지 간(홈↔/introduce 등) 라이브 확인: `document.startViewTransition` 호출 + 크로스페이드.
- (백엔드 미가동으로 로고 모핑 라이브 QA 는 데이터 필요 → wiring 은 테스트/코드로 검증, 모핑 시각 확인은 데이터 환경에서 후속.)
