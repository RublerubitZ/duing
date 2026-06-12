# Du-ing — Style Reference
> 크림 종이 위 딥그린 잉크로 꾸민 캠퍼스 스크랩북

**Theme:** light (라이트 고정 — `color-scheme: light`, 다크모드 없음)

Du-ing 의 비주얼 랭귀지는 따뜻한 크림 캔버스(#F6F3EC) 위에서 딥 포레스트 그린 잉크(#1F4A36)가 모든 구조적 무게를 담당하는 에디토리얼 스크랩북이다. 헤딩과 프라이머리 버튼은 잉크가, 장식은 세이지(#9DB6A0)가 맡는다 — Sparkle 스티커, 형광펜 밑줄, 라이브 도트가 전부 세이지다. 깊이는 두꺼운 테두리가 아니라 1px 웜그레이 헤어라인(#E5E2DA)과 잉크색 틴트 소프트 섀도, 그리고 인라인 rotate 로 기울인 카드 콜라주가 만든다. 타이포는 이중 인격 — GmarketSans 가 84px 초대형 헤드라인에서 포스터처럼 외치고, Pretendard 가 본문을 조용히 받치며, JetBrains Mono 마이크로 라벨(`DU + ING`, `01 / 04`)이 사전(辭典) 같은 격식을 더한다. 무드는 절제된 playful — 이모지는 그래픽 레이어에만, 느낌표는 페이지당 1회, 장난기는 `두잉/ing` 워드플레이로만 표현한다.

> 토큰 원본: `apps/web/tailwind.config.ts` + `apps/web/app/globals.css`
> 모든 토큰은 **`.duing` 스코프 안에서만 적용**된다 — 페이지 루트에 `className="duing min-h-screen bg-cream"` 래퍼 필수.

## Tokens — Colors

Tailwind 토큰과 `.duing` 스코프 CSS 변수(`var(--ink)` 등)가 1:1 동일 값.

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | `#1F4A36` | `ink` / `--ink` | 프라이머리 — 버튼 배경, 강조 텍스트, 활성 네비 언더라인. 모든 섀도의 베이스 색이기도 하다 |
| Ink Deep | `#143025` | `ink-deep` / `--ink-deep` | 헤딩 텍스트(h1~h4 자동), `btn-primary` hover, 다크 띠 배경 — 페이지에서 가장 어두운 잉크 |
| Ink Soft | `#2E6149` | `ink-soft` / `--ink-soft` | ink 의 밝은 변형 — 저빈도 보조 |
| Sage | `#9DB6A0` | `sage` / `--sage` | **장식 전용** — Sparkle, 형광펜 밑줄(`border-sage`), 라이브 도트. 텍스트 컬러로 승격 금지 |
| Sage Soft | `#C9D8CC` | `sage-soft` / `--sage-soft` | 연한 보더, 히어로 블러 원 그라디언트 |
| Sage Mist | `#E8EEE8` | `sage-mist` / `--sage-mist` | `.pill` 기본 배경, CTA 패널 서피스 |
| Sage Tint | `#F1F5F1` | `sage-tint` / `--sage-tint` | hover·선택 상태 배경 (드롭다운 항목 등 인터랙션 피드백) |
| Cream | `#F6F3EC` | `cream` / `--cream` | 페이지 캔버스 — 모든 것이 올라가는 따뜻한 종이 |
| Cream 2 | `#EFEBE0` | `cream-2` / `--cream-2` | 한 톤 어두운 크림 — 푸터 배경 |
| Paper | `#FFFFFF` | `paper` / `--paper` | 카드·서피스 흰색, 반전 텍스트 |
| Charcoal | `#2F3433` | `charcoal` / `--charcoal` | 본문 기본 텍스트 (`.duing` 기본값) |
| Charcoal 2 | `#4A504F` | `charcoal-2` / `--charcoal-2` | 보조 텍스트 |
| Charcoal 3 | `#6F7574` | `charcoal-3` / `--charcoal-3` | 메타·캡션·빈 상태 텍스트 — 텍스트 위계의 바닥 |
| Line | `#E5E2DA` | `line` / `--gray-line` | 모든 보더의 기본 — 1px 웜그레이 헤어라인. 점선 변형도 이 색 |
| Gray Soft | `#F0EDE5` | `graysoft` / `--gray-soft` | `btn-ghost` hover, 빈 상태 배경 워시 |
| Warm | `#E8B968` | `warm` / `--warm` | 옐로 액센트 — pill 페어 전용 (`#fbefd7` / `#8e6620`) |
| Coral | `#D97757` | `coral` / `--coral` | 코랄 액센트 — pill 페어(`#fce2d9` / `#9a3f23`) + 위험·로그아웃 (`rgba(217,119,87,0.05)` 배경) |
| Berry | `#B65672` | `berry` / `--berry` | 베리 액센트 — pill 페어 (`#f6dce3` / `#7e2a45`) |
| Sky | `#6A95B8` | `sky` / `--sky` | 블루 액센트 — pill 페어 (`#dde8f1` / `#2f557a`). 유일하게 50~950 풀 스케일 보유 |

액센트 4색(warm·coral·berry·sky)은 포인트 전용 — 파스텔 배경 + 딥톤 텍스트 pill 페어로만 쓰고 큰 면적에 깔지 않는다. 카테고리/도메인 틴트 배경은 `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)` (hex 알파 13%/7%) 공식.

## Tokens — Typography

### GmarketSans — 디스플레이 전용. 헤딩·브랜드 마크·디스플레이 숫자에서만 외치는 포스터 보이스 · `font-display`
- **Substitute:** Pretendard(폴백 내장), system-ui
- **Weights:** 300, 500, 700 (CDN `@font-face`, `font-display: swap`)
- **Sizes:** 26px(브랜드 마크), 36px(스탯 숫자), clamp(28~38px)·44px(섹션 h2), 84px(히어로)
- **Line height:** 1.0–1.1
- **Letter spacing:** -0.035em(84px 히어로), `tracking-tightx`(-0.02em, h1~h4 자동)
- **Role:** `.duing` 스코프에서 h1~h4 에 **자동 적용** (`font-display text-ink-deep font-bold tracking-tightx`, line-height 1.1). 본문·UI 에 쓰지 않는다. 84px 히어로 + `leading-none` + `<br/>` 강제 개행이 시그니처.

### Pretendard — 기능하는 모든 것: 본문·버튼·카드·네비. 디스플레이가 외칠 수 있도록 조용히 받친다 · `font-body`
- **Substitute:** system-ui, -apple-system
- **Weights:** 400, 500, 600, 700
- **Sizes:** 11.5, 12.5, 13, 13.5, 15, 16(text-base), 18(text-lg) — 표준 스케일 대신 **픽셀 임의값이 기본** (`text-[13.5px]` 등)
- **Line height:** 1.5 (`.duing` 기본), 히어로 서브카피 1.6
- **Letter spacing:** -0.005em (`.duing` 기본), `font-feature-settings: 'ss01' 'ss02' 'cv11'`
- **Role:** 본문 텍스트. 위계는 크기보다 **색 3단**(charcoal-3 → charcoal-2 → ink/ink-deep+bold)으로 만든다.

### JetBrains Mono — 마이크로 라벨, 인덱스, 카운터. 사전·도감 같은 격식 담당 · `font-mono`
- **Substitute:** ui-monospace, Menlo (로딩 선언 없음 — 시스템 폴백 의존)
- **Weights:** 400, 600, 700
- **Sizes:** 10, 11, 11.5px
- **Letter spacing:** +0.12em ~ +0.22em (와이드 트래킹이 필수)
- **Role:** `font-mono text-[11~11.5px] font-bold tracking-[0.14em~0.16em]` 조합이 시그니처. 모노 배지(`DU + ING`), 사전식 주석, 페이저 카운터(`01 / 04`, zero-pad), 인덱스 칩. 영문 대문자로만 쓴다.

### Type Scale

| Role | Size | Line Height | Letter Spacing | 실제 클래스 |
|------|------|-------------|----------------|------------|
| mono-tag | 10–11.5px | 1.2 | +0.12~0.22em | `font-mono text-[11.5px] font-bold tracking-[0.14em]` |
| caption | 11.5–12.5px | 1.4 | — | `text-[11.5px] text-charcoal-3` |
| ui | 13–13.5px | 1.4 | — | `text-[13px]` / `text-[13.5px] font-semibold` |
| body-sm | 15px | 1.5 | — | `text-[15px]` (검색 인풋) |
| body | 16–18px | 1.5–1.6 | -0.005em | `text-lg leading-[1.6] text-charcoal-2` (히어로 서브) |
| card-title | 17–18px | 1.3 | — | `text-[17px]`~`text-[18px]` (h3 자동 스타일) |
| heading-sm | 28–38px | 1.1 | -0.025em | `clamp(28px, 3vw, 38px)` (Categories h2) |
| heading | 36–44px | 1.1 | tightx | `text-[44px]`(FeaturedClubs h2) / `text-4xl`(LeaderCta) |
| display | 84px | 1.0 | -0.035em | `text-[84px] leading-none tracking-[-0.035em]` (히어로 전용) |

## Tokens — Spacing & Shapes

**Base unit:** 4px (Tailwind 기본) — 단, 수직 리듬은 기계적 등간격 대신 **수공예적 비대칭** (`mb-[22px]`, `pt-24 pb-10`, `pb-6 pt-20` 처럼 임의값 혼용)

**Density:** comfortable

### Border Radius (기본 스케일 오버라이드 — 이 네 값이 전체 형태 어휘)

| Element | Value | 클래스 |
|---------|-------|--------|
| buttons, 썸네일, 드롭다운 아바타 | 14px | `rounded-md` |
| cards | 20px | `rounded-lg` |
| 배너·CTA 패널 | 28px | `rounded-xl` |
| small (btn-sm) | 8px | `rounded-sm` |
| pills·배지·도트·원형 버튼 | 9999px | `rounded-full` |
| 카테고리 타일 (예외) | 18px | `rounded-[18px]` |

### Shadows (전부 잉크색 `rgb(31 74 54)` 틴트 — 뉴트럴 그레이 섀도 금지, 임의 `shadow-[...]` 금지)

| Name | Value | Token |
|------|-------|-------|
| shadow-1 | `0 1px 2px rgb(31 74 54 / 0.04), 0 2px 8px rgb(31 74 54 / 0.04)` | `shadow-1` / `--shadow-1` |
| shadow-2 | `0 2px 6px rgb(31 74 54 / 0.05), 0 12px 32px rgb(31 74 54 / 0.08)` | `shadow-2` / `--shadow-2` |
| shadow-3 | `0 6px 20px rgb(31 74 54 / 0.08), 0 24px 60px rgb(31 74 54 / 0.12)` | `shadow-3` / `--shadow-3` |

### Layout

- **Page max-width:** 1280px (`max-w-layout mx-auto`) + 섹션 좌우 패딩 `px-10` — 네비·히어로·섹션·푸터 전부 동일한 컨테이너 공식
- **Section gap:** 비대칭 (예: `pt-24 pb-10`, `py-16`, `pt-20 pb-6`) — 리듬 조절용으로 섹션마다 다르게
- **Card padding:** 16px (`p-4`), CTA 패널은 `px-14 py-11`
- **Card grid:** `grid gap-4 md:grid-cols-4` / `gap-5`. 히어로는 비대칭 2컬럼 `md:grid-cols-[1.15fr_1fr] gap-16`

## Components

### Primary Button (`.btn .btn-primary`)
**Role:** 핵심 전환 액션 — 검색, 등록 신청, 배너 CTA.

`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md font-semibold text-sm cursor-pointer transition` + `letter-spacing: -0.01em`. Ink(#1F4A36) 배경, Paper 텍스트, hover 는 `bg-ink-deep` 색상 전환만 — translate/scale/섀도 변화 없음. 주요 CTA 는 텍스트 뒤 `<ArrowRight />` 동반. 변형: `.btn-big`(px-7 py-4 text-base rounded-lg), `.btn-sm`(px-3.5 py-2 text-[13px] rounded-sm), 알약형은 `rounded-full` 오버라이드 (네비 가입 CTA: `btn btn-primary btn-sm rounded-full px-4`).

### Secondary / Ghost Button (`.btn-secondary` / `.btn-ghost`)
**Role:** 보조 액션, 텍스트성 컨트롤.

Secondary: `bg-paper text-ink border border-line hover:border-sage` — 보더가 sage 로 물드는 것이 유일한 hover. Ghost: `bg-transparent text-charcoal-2 hover:bg-graysoft hover:text-charcoal`. 원형 아이콘 버튼: `btn btn-secondary grid h-9 w-9 place-items-center rounded-full p-0` (캐러셀 prev/next).

### Search Capsule (캡슐 인 패널)
**Role:** 히어로 검색 — 인풋과 버튼을 한 장의 흰 패널에 담는다.

`flex max-w-[540px] items-center gap-1.5 rounded-lg bg-paper p-1.5 shadow-2` — **섀도는 패널이 갖고 버튼은 갖지 않는다.** 내부 인풋 `text-[15px] border-none bg-transparent outline-none`, 버튼 `btn btn-primary rounded-md px-[22px] py-3.5`.

### Pill / Badge (`.pill` 계열)
**Role:** 카테고리 라벨, 상태 배지.

`.pill` = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-sage-mist text-ink whitespace-nowrap`. 변형: `.pill-solid`(bg-ink text-paper), `.pill-outline`(border-line, text-charcoal-2), 파스텔 페어 `.pill-warm`(#fbefd7/#8e6620) `.pill-coral`(#fce2d9/#9a3f23) `.pill-berry`(#f6dce3/#7e2a45) `.pill-sky`(#dde8f1/#2f557a). 상태 배지에는 라이브 도트 `h-1.5 w-1.5 rounded-full bg-sage` 를 곁들인다. 표기는 `모집중`(붙여쓰기) 통일.

### Default Card (`.card` 확장형)
**Role:** 동아리·콘텐츠 카드의 표준형.

`group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-line bg-paper p-4 transition hover:shadow-2` — hover 는 섀도만, transform 없음. 썸네일은 `grid h-[156px] place-items-center rounded-md` + 카테고리색 틴트 그라디언트. 카드 푸터는 **점선 구분선** `border-t border-dashed border-line pt-3` 가 시그니처. 로고 없으면 카테고리색 이니셜 글자(`text-[44px] font-bold`)로 대체.

### Lift Card (카테고리 타일)
**Role:** 더 적극적인 인터랙션이 필요한 탐색 타일 — 페이지당 한 종류만.

`rounded-[18px]` + 카드별 `--accent` CSS 변수 주입. `transition-[transform,box-shadow,border-color] duration-[250ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-1 hover:border-[color:var(--accent)]`. 내부 이미지 `group-hover:scale-105`(600ms), 원형 화살표 버튼 `group-hover:-rotate-45` + 액센트색 채움.

### CTA Panel
**Role:** 섹션 전체가 한 장의 패널인 마무리 CTA (LeaderCta).

보더·섀도 없이 `rounded-xl bg-sage-mist px-14 py-11` — 색 면이 분리를 담당한다. SparkleFull 2개(48px/opacity-60 + 28px/opacity-40)를 절대배치 장식으로.

### Dark Card / Toast
**Role:** 알림 흉내 데코, 반전 강조 블록.

`rounded-md bg-ink p-3 text-white shadow-3` + 아이콘 칩 `grid h-11 w-11 place-items-center rounded-md bg-white/15`. 보조 텍스트는 `opacity-75`.

### Section Heading Block
**Role:** 모든 콘텐츠 섹션의 도입부.

`mb-9 flex items-end justify-between` — 좌측: 아이브로우(**`영문 키워드 · 한글 설명`** 포맷, `font-mono text-[11.5px]` + 와이드 트래킹 또는 `text-[13px] font-semibold tracking-wide08 text-ink`) + 큰 h2. 우측: `전체 보기` 링크 `flex items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2` (gap 모핑으로 화살표 밀기).

### Nav Bar (HomeNav)
**Role:** 사이트 전역 상단 바.

`relative z-50 border-b border-line bg-cream/90 backdrop-blur` — 반투명 크림 + 블러 + 하단 헤어라인. 내부 `max-w-layout mx-auto flex items-center gap-12 px-10 py-3`. 링크 `text-[13.5px] font-semibold`, 비활성 `text-charcoal-3 hover:text-charcoal`, 활성 `text-ink-deep` + 언더라인 바 `absolute -bottom-1 h-0.5 rounded-full bg-ink`. 드롭다운: `w-[280px] rounded-[16px] border border-line bg-paper` + `var(--shadow-3)`, 항목 hover `bg-sage-tint`.

### Carousel Pager
**Role:** 배너 캐러셀 인디케이터.

모핑 도트: `h-[5px] rounded-full transition-all` + 활성 `w-6 bg-ink` / 비활성 `w-[5px] bg-line` — 점이 알약으로 늘어난다. 옆에 `font-mono text-xs` 카운터 `01 / 04` (zero-pad).

### Sparkle (장식 모티프)
**Role:** 브랜드 장식 — 헤딩 옆 스티커, 카드 모서리.

`@/components/duing/Sparkle` 의 `Sparkle`(4선) / `SparkleFull`(8선 별). 기본색 sage(#9DB6A0), stroke 2.2 round cap. 크기·투명도 차등 배치(48px/0.6 + 28px/0.4)로 깊이감. 면적이 아닌 점으로 — 페이지당 2~4개.

### Collage Card Stack
**Role:** 히어로 우측의 스크랩북 콜라주.

`relative h-[540px]` 캔버스에 카드 4장을 전부 absolute 절대배치 + 인라인 `style={{ transform: 'rotate(±3~7deg)' }}` — **각 카드가 다른 각도**. Tailwind `rotate-*` 대신 인라인 스타일이 컨벤션.

### Dictionary Annotation (사전식 주석)
**Role:** 워드플레이를 시각화하는 시그니처 장치.

단어 아래 `font-mono text-[11px] font-bold tracking-[0.16em] text-charcoal-3` 라벨 + 눈금선 `h-px w-3.5 bg-charcoal-3 opacity-50`. 형광펜 밑줄 변형: `<em className="border-b-2 border-sage pb-px font-bold not-italic text-ink-deep">`.

### Suggested Keyword Chip
**Role:** 검색 아래 추천 키워드.

`rounded-full border border-dashed border-line px-3 py-[5px] text-[13px] font-medium text-charcoal-2 hover:border-ink hover:text-ink` — 점선 보더가 "수기 메모" 느낌의 핵심.

## Motion

### 타이밍 사전

| 용도 | Duration / Easing |
|------|-------------------|
| 슬라이드 전환 (`animate-slide-in/out-*` 4종) | `400ms cubic-bezier(0.32, 0, 0.2, 1)` |
| 등장 (`animate-preview-in`, ±16px fade-up) | `520ms cubic-bezier(0.16, 1, 0.3, 1)` — 스태거 `animationDelay: 120ms` |
| 카드 리프트·버튼 회전 | `250ms cubic-bezier(.2,.7,.2,1)` |
| 이미지 줌 | `600ms cubic-bezier(.2,.7,.2,1)` |
| 팝인 (`animate-pop-in`, 오버슈트) | `.6s cubic-bezier(.2,.9,.3,1.4)` + delay `.8s` |
| 앰비언트 플로트 (`animate-float-a/b`) | `6~6.5s ease-in-out infinite` (b 는 delay `1.2s`) |
| 스크롤 리빌 (`.feature-*` + `.feature-visible`) | `1s cubic-bezier(.2,.7,.2,1)`, 비주얼 delay 180ms |

### 원칙

- 기본은 **색상 전환만**. transform hover 는 Lift Card·원형 버튼 등 의도된 곳에만
- 무한 마퀴 금지 — 티커도 정적 한 줄 + `overflow-hidden` 클리핑으로 연출
- 전환 애니메이션은 `key` 에 상태를 넣어 재마운트로 리트리거, 동적 클래스는 tailwind `safelist` 등록
- 캐러셀 자동재생 5초, 일시정지 토글 제공

## Copywriting

### 어체 3층 규칙

| 층 | 어체 | 예시 |
|----|------|------|
| 헤드라인·서브 | 해요체 또는 명사형 종결 | `관심사로 시작해요`, `지금 가장 활발한 곳`, `모집 중이에요` |
| CTA | 명사형 2~8자 (`~보기`/`~신청`/`~받기`) | `검색`, `전체 보기`, `동아리 등록 신청`, `혜택 받기` |
| 시스템·안내 | 합쇼체 | `승인됩니다`, `~해주세요`, `배너 이미지가 없습니다` |

합쇼체를 마케팅 카피에, 권유형(`~하세요`)을 CTA 에 쓰지 않는다.

### 표기 규칙

- 나열은 가운뎃점 `·`, 부연은 줄표 `—`, 기한은 `~ M.D` — 쉼표 나열·괄호 부연 대신 이 세 기호로 통일
- 숫자는 단위와 결합: `{n}곳`, `{n}개 동아리`, `모집 20명`, `· 10기`
- 아이브로우 포맷 고정: **`영문 대문자 키워드 · 한국어 설명`** (예: `FEATURED · 이번 주 주목`, `APPLICATION · 지원 현황`)
- 느낌표는 알림성 마이크로카피 한정 페이지당 최대 1회, 이모지는 카피 문장 안에 넣지 않는다
- 헤드라인은 3~8어절, 줄바꿈으로 호흡을 끊는다. playful 함은 `두잉/ing` 워드플레이로만

### Empty State

- **섹션 레벨:** 데이터 없으면 섹션 자체를 렌더하지 않는다 (`return null`) — 빈 안내 박스 노출 금지
- **필드 레벨:** 건조한 명사형/합쇼체 짧은 문구 (`소개 준비중`, `이미지 없음`), `text-charcoal-3` + `bg-graysoft`. 사과·느낌표 금지

## Do's and Don'ts

### Do
- 페이지 루트에 `duing` 클래스를 — 토큰·헤딩 자동 스타일이 스코프 안에서만 작동한다
- 섀도는 잉크 틴트 `rgb(31 74 54 / …)` 토큰(`shadow-1~3`)만 — 뉴트럴 그레이 섀도는 카드를 팔레트에서 분리시킨다
- 카드 20px(`rounded-lg`) / 버튼 14px(`rounded-md`) / 인터랙티브 알약 9999px(`rounded-full`) — 이 형태 어휘 안에서만
- 텍스트 위계는 charcoal 3단 + ink 강조로, hover 는 한 단계 진해지는 색 전환으로 (`hover:text-ink`, `hover:border-sage`)
- sage 는 장식(Sparkle·밑줄·도트·틴트 배경)에만, 액센트 4색은 pill 페어로만
- 섹션 배경 리듬을 유지 — 크림 베이스에 다크그린 띠(`bg-ink-deep`)는 페이지당 1회, 마무리는 세이지 패널
- 기존 컴포넌트 클래스(`.btn` `.pill` `.card`)와 `@/components/duing/*`(Icon, Sparkle)를 재사용

### Don't
- `border-2 border-black`, 하드 드롭섀도, 임의 `shadow-[...]` — 네오브루탈 문법 금지. 테두리는 항상 1px `border-line`
- sage 를 텍스트 컬러로 쓰지 않는다 — 장식 전용이다
- 버튼에 transform hover·그림자 변화를 주지 않는다 — 버튼 hover 는 색상 전환만
- 무한 마퀴·과도한 스프링 모션 금지 — 모션은 절제가 기본값
- 카피 문장 속 이모지·느낌표 남발 금지, CTA 권유형(`~하세요`) 금지
- 순수 검정(#000000)을 텍스트에 쓰지 않는다 — charcoal(#2F3433)이 본문 잉크다
- 다크모드 대응 코드를 넣지 않는다 — 라이트 고정

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Cream Canvas | `#F6F3EC` | 페이지 배경 — 모든 섹션의 베이스 |
| 1 | Paper Card | `#FFFFFF` | 카드·패널·검색 캡슐 — 헤어라인 보더 + 잉크 섀도와 함께 |
| 2 | Sage Mist Panel | `#E8EEE8` | CTA 패널, pill 배경 — 보더·섀도 없이 색 면으로 분리 |
| 3 | Cream 2 | `#EFEBE0` | 푸터 — 본문보다 한 톤 가라앉은 마감 |
| 4 | Ink Deep Band | `#143025` | 풀블리드 다크 띠(티커) — 페이지당 1회의 다크 브레이크, Paper 텍스트 |

## Elevation

- **Default card (hover):** `shadow-2` — `0 2px 6px rgb(31 74 54 / 0.05), 0 12px 32px rgb(31 74 54 / 0.08)`
- **검색 캡슐·네비 드롭다운·다크 카드:** `shadow-2` ~ `shadow-3`
- **Lift Card (hover):** `0 16px 32px rgba(47,58,46,.08), 0 2px 6px rgba(47,58,46,.04)` + `-translate-y-1`
- **버튼:** 섀도 없음 (패널이 대신 가진다)
- **CTA 패널·pill·푸터:** 섀도 없음 — 색 면과 보더로만

## Imagery

일러스트·사진보다 **타이포와 색면이 그래픽의 주인공**이다. 이모지는 카피에 못 들어가는 대신 그래픽 레이어에서 크게 활약한다 — 카드 썸네일의 단일 이모지(`🎸`, 48px, 카테고리색 틴트 그라디언트 위), 배너의 초대형 워터마크(`text-[220px] opacity-[0.18]` + rotate, 우상단 오버플로). 실사 사진은 카테고리 타일에만 (`next/image fill` + `object-cover` + 톤 그라디언트 오버레이), 사용자 업로드 배너는 `<img>` + `onError` 폴백. 아이콘은 `@/components/duing/Icon` 의 thin-stroke 라인 아이콘과 인라인 SVG(햇살 모양 `spin 6s linear infinite` 회전 등). 텍스트 자체를 그래픽으로 쓰는 패턴 — 모노 인덱스 칩(`01`), `{ }` 글리프, 이니셜 폴백 — 이 두잉다움의 핵심.

## Layout

1280px(`max-w-layout`) 중앙 컨테이너 + `px-10`, 풀블리드 크림 캔버스. 히어로는 비대칭 2컬럼(`md:grid-cols-[1.15fr_1fr]`) — 좌측 텍스트(모노 배지 → 84px 헤드라인 → 서브카피 → 검색 캡슐 → 점선 키워드 칩), 우측 rotate 콜라주 카드 스택. 배경에 도트 그리드(`bg-grid opacity-50`) + 우상단 sage 블러 원. 이후 섹션 리듬: 컬러 블록 배너(24:8 비율, `rounded-xl`) → **다크그린 풀블리드 띠**(유일한 다크 브레이크) → 크림 + 흰 카드 그리드 ×2 → 세이지 미스트 패널 마무리 → `bg-cream-2` 푸터. 섹션 수직 패딩은 비대칭으로 수공예적으로. 네비는 `bg-cream/90 backdrop-blur` 반투명 상단 바. 장식(Sparkle·회전·블러 원)은 히어로와 CTA 에 집중시키고 푸터·정보 영역은 조용하게 — 대비가 리듬을 만든다.

## Agent Prompt Guide

**Quick Color Reference**
- text: `#2F3433` (charcoal) — 헤딩은 `#143025` (ink-deep) 자동
- background: `#F6F3EC` (cream)
- surface/card: `#FFFFFF` (paper)
- border: `#E5E2DA` (line)
- accent/장식: `#9DB6A0` (sage)
- primary action: `#1F4A36` (ink filled)

**Example Component Prompts**

1. **섹션 도입부**: `mb-9 flex items-end justify-between`. 좌측에 아이브로우 `font-mono text-[11.5px] font-semibold uppercase tracking-[0.22em]` 으로 `APPLICATION · 지원 현황`, 그 아래 h2(자동으로 GmarketSans ink-deep bold). 우측에 `flex items-center gap-1.5 text-sm font-semibold text-ink hover:gap-2` 링크 `전체 보기` + ArrowRight.
2. **표준 카드**: `rounded-lg border border-line bg-paper p-4 transition hover:shadow-2`. 상단 썸네일 `grid h-[156px] place-items-center rounded-md` + `linear-gradient(135deg, #1F4A3622, #1F4A3611)`. 제목 h3 17px, 설명 `text-[12.5px] text-charcoal-3`, 푸터 `border-t border-dashed border-line pt-3` 양끝 정렬.
3. **상태 배지**: `.pill` + `h-1.5 w-1.5 rounded-full bg-sage` 도트 + `모집중`. 강조형은 `rounded-full bg-ink px-2.5 py-1 text-[11.5px] font-bold text-paper`.
4. **CTA 패널**: `rounded-xl bg-sage-mist px-14 py-11 md:grid-cols-[1fr_auto]`, 좌측 h2 `text-4xl` + 서브 `지원자 관리 · 공지 발송 · 회비 정산까지.` 스타일 나열, 우측 `btn btn-primary btn-big` + ArrowRight. SparkleFull 48px sage 절대배치 1~2개.
5. **빈 상태**: 데이터 없으면 섹션 `return null`. 필드 레벨은 `bg-graysoft text-charcoal-3 text-[13px]` 에 `소개 준비중` 같은 명사형 한 줄 — 사과·느낌표 없이.

## Similar Brands

- **Anthropic / Claude** — 같은 크림 종이 캔버스 + 코랄(#D97757은 두잉의 coral 토큰과 사실상 동일 계열) + 세리프 없는 따뜻한 에디토리얼. 두잉은 여기에 그린 잉크와 스크랩북 장식을 더한 캠퍼스 버전
- **Notion** — 종이 질감 미니멀, 단색 잉크가 구조 전체를 담당하는 위계, 이모지를 그래픽 요소로 승격시키는 어법
- **Pitch / SayBriefly 계열** — 크림 캔버스에 스티커·콜라주 감성 카드를 흩뿌리는 무드보드 리듬. 두잉은 파스텔 대신 rotate 와 점선으로 손맛을 낸다
- **Substack** — 텍스트 우선 에디토리얼 레이아웃과 절제된 단일 액센트 운용

## Quick Start

토큰은 **이미 구현되어 있다** — 새 코드는 아래를 그대로 사용하고, 새 토큰 추가 시 `tailwind.config.ts` 와 `globals.css` `.duing` 스코프 양쪽에 등록한다.

### CSS Custom Properties (`globals.css` `.duing` 스코프 — inline style 용)

```css
.duing {
  --paper:      #FFFFFF;
  --cream:      #F6F3EC;
  --cream-2:    #EFEBE0;
  --ink:        #1F4A36;
  --ink-deep:   #143025;
  --ink-soft:   #2E6149;
  --sage:       #9DB6A0;
  --sage-soft:  #C9D8CC;
  --sage-mist:  #E8EEE8;
  --sage-tint:  #F1F5F1;
  --charcoal:   #2F3433;
  --charcoal-2: #4A504F;
  --charcoal-3: #6F7574;
  --gray-line:  #E5E2DA;
  --gray-soft:  #F0EDE5;
  --warm:       #E8B968;
  --coral:      #D97757;
  --berry:      #B65672;
  --sky:        #6A95B8;
  --font-display: 'GmarketSans', Pretendard, system-ui, sans-serif;
  --font-body:    Pretendard, system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, Menlo, monospace;
  --shadow-1: 0 1px 2px rgba(31,74,54,.04), 0 2px 8px rgba(31,74,54,.04);
  --shadow-2: 0 2px 6px rgba(31,74,54,.05), 0 12px 32px rgba(31,74,54,.08);
  --shadow-3: 0 6px 20px rgba(31,74,54,.08), 0 24px 60px rgba(31,74,54,.12);
}
```

### Tailwind (v3 — `tailwind.config.ts` `theme.extend` 요약)

```ts
colors: {
  ink: { DEFAULT: '#1F4A36', deep: '#143025', soft: '#2E6149' },
  sage: { DEFAULT: '#9DB6A0', soft: '#C9D8CC', mist: '#E8EEE8', tint: '#F1F5F1' },
  charcoal: { DEFAULT: '#2F3433', 2: '#4A504F', 3: '#6F7574' },
  line: '#E5E2DA', graysoft: '#F0EDE5',
  cream: { DEFAULT: '#F6F3EC', 2: '#EFEBE0' }, paper: '#FFFFFF',
  warm: '#E8B968', coral: '#D97757', berry: '#B65672', sky: { DEFAULT: '#6A95B8' /* +50~950 */ },
},
fontFamily: {
  display: ['GmarketSans', 'Pretendard', 'system-ui', 'sans-serif'],
  body: ['Pretendard', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
},
borderRadius: { sm: '8px', md: '14px', lg: '20px', xl: '28px' },
boxShadow: {
  1: '0 1px 2px rgb(31 74 54 / 0.04), 0 2px 8px rgb(31 74 54 / 0.04)',
  2: '0 2px 6px rgb(31 74 54 / 0.05), 0 12px 32px rgb(31 74 54 / 0.08)',
  3: '0 6px 20px rgb(31 74 54 / 0.08), 0 24px 60px rgb(31 74 54 / 0.12)',
},
maxWidth: { layout: '1280px' },
letterSpacing: { tightx: '-0.02em', body: '-0.005em', wide04: '0.04em', wide06: '0.06em', wide08: '0.08em', wide16: '0.16em' },
```

컴포넌트 클래스(`.btn` 계열, `.pill` 계열, `.card`, `.bg-grid`, `.brand-mark`)와 애니메이션 키프레임 전체는 `globals.css` `@layer components` 참조.
