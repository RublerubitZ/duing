# DESIGN.md 출시 전 수정 계획서 (Pre-launch Fix Plan)

> 출처: [`DESIGN-AUDIT.md`](./DESIGN-AUDIT.md) 의 "최종 분류 1. 출시 전 수정 권장"
> 범위: **P0 3건 + 스코프 래퍼 2줄** (line 244~251 Don't 직접 위반 + 최고 비용효율 절차 복구)
> 원칙: 이 문서는 **계획서**다. 실제 수정은 아래 절차/검증을 따라 별도 브랜치에서 수행한다.
> 라인 번호는 감사 시점 기준 — 적용 전 해당 위치를 다시 확인할 것.

---

## 한눈에 보기

| # | 항목 | 파일 | 위반 규칙 | 난이도 | 시각 변화 |
|---|---|---|---|---|---|
| P0-1 | BulkActionBar 임의 뉴트럴 섀도 | `applicants/_components/BulkActionBar.tsx:31` | line 245·95 | 낮음 | 미미 |
| P0-2a | ApplyForm 제출 버튼 섀도+transform | `apply/.../ApplyForm.tsx:146` | line 247·268 | 낮음 | 미미 |
| P0-2b | ClubInfoForm 저장 버튼 섀도+transform+raw-hex | `info/_components/ClubInfoForm.tsx:518` | line 247·268·30 | 낮음 | 소(색 보정) |
| P0-3a | SettingsSummary 버튼 hover-translate + sage fill | `me/_components/SectionSettingsSummary.tsx:43` | line 247·246 | 낮음 | 결정 필요 |
| P0-3b | Notify 버튼 hover-translate | `me/_components/SectionNotify.tsx:178` | line 247 | 낮음 | 없음 |
| S-1 | admin 레이아웃 스코프 누락 | `admin/layout.tsx:7` | line 9·236 | 낮음 | **헤딩 QA** |
| S-2 | manage 콘솔 스코프 누락 | `manage/_components/ManageShell.tsx:20` | line 9·236 | 낮음 | **헤딩 QA** |

총 예상 작업: 파일 7개 · 라인 7곳. **스코프 2건(S-1/S-2)은 자동 헤딩 시각 변화를 동반하므로 반드시 시각 QA** 후 머지.

---

## P0-1 · BulkActionBar 임의 뉴트럴 섀도

**파일:** `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/BulkActionBar.tsx:31`
**위반:** line 245(`임의 shadow-[...] 금지 · 테두리는 1px border-line`), line 95(`뉴트럴 그레이 섀도 금지`)

```diff
- className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]"
+ className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper shadow-[0_-4px_12px_-4px_rgba(31,74,54,0.10)]"
```

**이유:** `border-slate-200`→`border-line`(웜그레이 헤어라인), `bg-white`→`bg-paper`(토큰), 섀도의 뉴트럴 `rgba(0,0,0)`→잉크틴트 `rgba(31,74,54)`. 핵심 Don't인 "뉴트럴 색"을 제거.
**주의(어휘 순도):** 하단 바는 **위로** 뜨는 섀도가 필요한데 토큰 `shadow-1~3`는 모두 아래 방향이라 표현 불가. 위 수정은 잉크틴트로 보정하되 임의표기는 남는다. **완전 토큰화를 원하면** `tailwind.config.ts` + `globals.css .duing`에 위방향 잉크틴트 `shadow-up` 토큰을 신설(line 306 절차)해 `shadow-up`으로 치환. 또는 두잉 "1px 헤어라인" 철학을 따라 **섀도를 제거하고 `border-t border-line`만**으로 분리해도 무방.
**(선택) 동반 정리:** 같은 파일 내부의 `text-slate-700/900`(34·35), `border-amber-200 text-amber-700`(41) 등은 P1(오프토큰)이라 P0 범위는 아니지만, 파일을 여는 김에 `text-charcoal-2/ink`·`.pill` 페어로 정리 권장.

---

## P0-2 · 제출/저장 버튼 섀도 + transform (3중 위반)

**위반:** line 247(`버튼 transform hover·그림자 변화 금지`), line 268(`버튼 섀도 없음`), line 30(raw-hex)

### P0-2a · ApplyForm 제출 버튼
**파일:** `app/apply/[recruitmentId]/_components/ApplyForm.tsx:146`

**권장(컴포넌트 재사용 — P0 + 형태/hover/중복 P1 동시 해소):**
```diff
- className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-[0_1px_0_rgba(0,0,0,0.04),_0_6px_16px_rgba(31,74,54,0.20)] transition-colors hover:bg-ink-soft active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
+ className="btn btn-primary px-7 disabled:cursor-not-allowed disabled:opacity-50"
```
> `.btn .btn-primary` = `bg-ink text-paper hover:bg-ink-deep rounded-md`(섀도·transform 없음). `px-7`로 기존 가로 여백 유지. 자식 `<ArrowRight/>`는 그대로 둔다.

**최소 diff 대안(.btn 미전환 시):** `shadow-[...]`·`active:translate-y-px` 제거 + `rounded-[10px]`→`rounded-md`, `text-cream`→`text-paper`, `hover:bg-ink-soft`→`hover:bg-ink-deep`.

### P0-2b · ClubInfoForm 저장 버튼
**파일:** `app/manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx:518~519`

```diff
- className="inline-flex items-center gap-2 bg-[#3e5b34] text-[#f6f1dd] border-none rounded-[8px] px-[22px] py-[11px] text-[14px] font-semibold cursor-pointer transition-colors hover:bg-[#4a6b3f] active:translate-y-px disabled:opacity-50"
- style={{ boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 6px 16px rgba(62,91,52,.18)' }}
+ className="btn btn-primary disabled:opacity-50"
```
**이유:** 이 버튼은 raw-hex 그린(`#3e5b34`, ink 아님) + 인라인 `boxShadow`(뉴트럴+오프그린) + `active:translate-y-px`로 P0(섀도·transform) **및** P1(raw-hex 팔레트)을 모두 포함. `.btn .btn-primary`로 교체하면 한 번에 토큰화된다. `style` 속성은 **완전 삭제**.
**시각 변화:** 버튼색이 `#3e5b34`(탁한 녹)→`#1F4A36`(ink, 더 진하고 채도 높음). 의도된 정정.

---

## P0-3 · 버튼 hover transform

**위반:** line 247(`버튼 hover는 색상 전환만`), line 246(sage 면적 승격)

### P0-3a · SectionSettingsSummary 버튼
**파일:** `app/me/_components/SectionSettingsSummary.tsx:43~44`

**필수(P0 — transform 제거):**
```diff
- className="relative z-[1] inline-flex items-center gap-2 px-[22px] py-3.5 rounded-[14px] font-bold text-[14px] text-ink-deep whitespace-nowrap transition-[transform,background] duration-150 hover:-translate-y-px"
+ className="relative z-[1] inline-flex items-center gap-2 px-[22px] py-3.5 rounded-[14px] font-bold text-[14px] text-ink-deep whitespace-nowrap transition-[background] duration-150"
  style={{ background: 'var(--sage)' }}
```
> ⚠️ transform만 제거하면 이 버튼은 **hover 피드백이 사라진다**(현재 hover bg 클래스가 없음). DESIGN은 hover=색 전환이므로 색 피드백을 함께 넣어야 한다.

**권장(P0 + sage-fill 정정 동시 — 시각 결정 필요):** 장식 전용 sage를 CTA 면적에 깐 것(line 240·246)이라 ink 버튼으로 전환:
```diff
- className="relative z-[1] inline-flex items-center gap-2 px-[22px] py-3.5 rounded-[14px] font-bold text-[14px] text-ink-deep whitespace-nowrap transition-[transform,background] duration-150 hover:-translate-y-px"
- style={{ background: 'var(--sage)' }}
+ className="btn btn-primary relative z-[1] px-[22px]"
```
> sage 배경(연녹)→ink(딥그린)으로 바뀌므로 **디자이너 확인 후** 채택. 유지하고 싶으면 위 "필수" 버전 + `hover:bg-sage-soft` 같은 색 hover를 별도 정의.

### P0-3b · SectionNotify "더 많은 알림 보기" 버튼
**파일:** `app/me/_components/SectionNotify.tsx:178`

```diff
- className="inline-flex items-center gap-2 px-[22px] py-2.5 rounded-full bg-paper border border-line text-charcoal-2 text-[13px] font-semibold transition-[background,border-color,color,transform] duration-150 hover:bg-sage-tint hover:border-ink hover:text-ink hover:-translate-y-px"
+ className="inline-flex items-center gap-2 px-[22px] py-2.5 rounded-full bg-paper border border-line text-charcoal-2 text-[13px] font-semibold transition-[background,border-color,color] duration-150 hover:bg-sage-tint hover:border-ink hover:text-ink"
```
**이유:** 이미 `hover:bg-sage-tint hover:border-ink hover:text-ink`(올바른 색 전환)를 갖고 있어 **`hover:-translate-y-px`와 transition의 `transform`만 제거**하면 완결. 별도 결정 불필요. (`bg-paper border border-line rounded-full`은 사실상 secondary 알약형이라 그대로 둬도 무방.)

---

## S-1 / S-2 · 스코프 래퍼 복구 (절차 위반)

**위반:** line 9·236 (페이지 루트 `.duing` 래퍼 필수)

### S-1 · admin 레이아웃
**파일:** `app/admin/layout.tsx:7` (admin 25개 라우트 일괄)
```diff
- <div className="bg-cream min-h-screen">
+ <div className="duing bg-cream min-h-screen">
```

### S-2 · manage 콘솔
**파일:** `app/manage/_components/ManageShell.tsx:20` (manage/clubs/[clubId] 13개 라우트 일괄)
```diff
- <div className="flex min-h-screen">
+ <div className="duing flex min-h-screen">
```

**`.duing` 추가 시 실제로 켜지는 것 (`globals.css` `@layer components`):**
1. 기본 본문 `text-charcoal` + `font-body`(Pretendard) + `font-feature-settings` + `letter-spacing -0.005em` + `line-height 1.5` + (`bg-cream`)
2. **`.duing h1~h4` 자동 스타일** → 서브트리의 모든 `<h1>`~`<h4>`가 `font-display(GmarketSans) text-ink-deep font-bold tracking-tightx line-height:1.1`로 변환 **(← 이게 유일한 가시적 리스크)**

**⚠️ 시각 QA 필수 (헤딩 변환):**
- 폰트 **크기는 유지**되고 패밀리/색/굵기/자간/행간만 바뀐다 → 대개 admin/manage 헤딩이 더 "두잉다워"지지만, 줄바꿈·정렬이 깨지지 않는지 확인.
- `rg -n '<h[1-4]' app/admin app/manage` 로 영향 헤딩을 먼저 목록화한 뒤 적용 → 화면 대조.
- 다크 사이드바(`ManageShell` aside `bg-ink-deep text-cream`)는 명시 클래스라 영향 없음. `Du·ing` 마크는 `font-mono` 명시라 유지.

**범위 한계 (오해 금지):** `.duing` 추가는 **절차 복구 + 자동 헤딩 + 인라인 `var()` 활성**까지다. 그 위에 이미 깔린 `text-slate-*`·`rose/emerald` 등 오프토큰(P1)은 **자동으로 안 고쳐진다** — 별도 후속 작업(출시 후).

---

## 적용 절차 & 검증

### 브랜치 / 커밋 (프로젝트 컨벤션)
- 브랜치: `develop`에서 분기 — 예) `fix/design-prelaunch-p0`
- 커밋: Conventional Commits — 예) `fix(frontend): DESIGN.md 출시 전 P0 위반 및 스코프 래퍼 복구`
- **자동 머지 금지** — PR 생성 후 리뷰 통과 시 사용자 지시로만 머지. 커밋/PR 본문에 AI 어트리뷰션 라인 금지.
- 권장 분리: **PR ①** P0-1·P0-2·P0-3(버튼/섀도, 시각 무해) / **PR ②** S-1·S-2(스코프, 헤딩 QA 필요) — 리뷰 단위 분리로 회귀 추적 용이.

### 빌드 검증
```bash
cd frontend
pnpm --filter @duing/web typecheck
pnpm --filter @duing/web build
pnpm --filter @duing/web lint
```

### 회귀 grep (수정 누락 확인)
```bash
cd frontend/apps/web
# P0-2/P0-3: 대상 버튼 transform 제거 확인 (해당 라인이 사라져야 함)
rg -n 'active:translate-y-px' app/apply app/manage/clubs/'[clubId]'/info
rg -n 'hover:-translate-y-px' app/me/_components/SectionSettingsSummary.tsx app/me/_components/SectionNotify.tsx
# P0-1: 뉴트럴 섀도 제거 확인
rg -n 'shadow-\[0_-4px.*rgba\(0,0,0' app/manage
# S-1/S-2: duing 래퍼 존재 확인
rg -n 'duing' app/admin/layout.tsx app/manage/_components/ManageShell.tsx
```

### 시각 QA 체크리스트
- [ ] **P0-1** manage 지원자 목록 → 항목 선택 시 하단 일괄바: 보더 헤어라인 + 잉크틴트(또는 무섀도) 자연스러운지
- [ ] **P0-2a** apply 지원서 제출 버튼: hover 색만 변화(들림/그림자 없음), 비활성 상태 정상
- [ ] **P0-2b** manage info 저장 버튼: ink 색으로 정정, hover `bg-ink-deep`, 들림 없음
- [ ] **P0-3a** me 설정 요약 버튼: hover 피드백 존재(전환 방식 결정 반영), 들림 없음
- [ ] **P0-3b** me 알림 "더 보기" 버튼: hover 색 전환만, 들림 없음
- [ ] **S-1** admin 임의 페이지: 헤딩 GmarketSans 변환 확인, 레이아웃 깨짐 없음
- [ ] **S-2** manage/clubs/[clubId]/* 임의 페이지: 동일 헤딩 QA, 사이드바/메인 정상

---

## 범위 밖 (이 계획서가 다루지 않음 — 출시 후)
색상 토큰 이탈(slate 433·status 242·raw-hex 110), `shadow-xl` 모달 23개, 버튼/인풋 공통화(163), 타이포 4건, 카피 3건, 형태 어휘 정규화, 컨테이너 공식, shadcn 스캐폴딩 처리, 접근성([미정의]). → `DESIGN-AUDIT.md` "최종 분류 2·3" 참조.
