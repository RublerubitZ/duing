# 전 페이지 섹션 구분선 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서비스 전반에서 섹션을 가르는 가로 구분선 89곳을 제거하고, 여백만으로 콘텐츠를 구분하는 디자인으로 통일한다. 함께 히어로 타이틀 아래 `DU` / `ING` 보조 텍스트를 제거한다.

**Architecture:** 신규 파일 없음. `frontend/apps/web` 의 Tailwind 보더 유틸리티를 지정된 89곳에서 걷어내고, 규칙을 `frontend/DESIGN.md` 에 명문화한다. 영역별로 태스크를 나눠 각 태스크가 독립적으로 리뷰·롤백 가능하게 한다.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v3, Vitest + Testing Library, pnpm workspaces

## Global Constraints

- 설계 SoT: `docs/superpowers/specs/2026-07-29-divider-removal-design.md`. 판정이 애매하면 스펙의 "판정 규칙" 표를 따른다.
- **판정 규칙:** 가로선은 컴포넌트를 정의할 때만 쓴다. 콘텐츠 블록을 가르는 데는 쓰지 않는다.
- **여백 정책:** 선만 제거하고 `padding` / `margin` 은 손대지 않는다. 여백 보정은 Task 9 의 실브라우저 QA 결과로만 한다.
- **변경 금지:** 배경색, 그림자, radius, 레이아웃 구조, `border-line` 토큰 값, 세로 구분선(`border-l` / `border-r`).
- **유지 대상은 절대 건드리지 않는다:** 테이블 `<tr>` 행선, 목록 행 구분선, 모달·시트·드롭다운 헤더/푸터선, 고정 하단 액션 바 및 `BottomNav` 의 `border-t`, 카드·버튼·인풋 외곽선, 탭 활성 표시 `border-b-[2.5px] border-ink`, `NoticeRichEditor` 툴바 하단선, `<em>ing</em>` 밑줄.
- 모든 명령의 cwd 는 `frontend/` 다. 저장소 루트는 `/Users/ksy/Desktop/BASIC/Coding/Duing`.
- 커밋 메시지는 Conventional Commits + 한국어. `Co-Authored-By` / `🤖 Generated` 라인 금지.
- 브랜치: `feat/divider-removal` (이미 생성됨, base `develop`).
- **push · PR 생성 금지.** 계획 완주 후에도 사용자 지시 없이 원격에 올리지 않는다.

## 테스트 전략에 대한 참고

이 작업은 CSS 클래스 제거다. "클래스가 없음"을 단언하는 테스트를 89개 쓰는 건 깨지기 쉬운 안티테스트이므로 **쓰지 않는다.** 대신 각 태스크의 검증은 세 가지다.

1. **기존 테스트 통과** — 회귀가 없음을 보장
2. **grep 가드** — 해당 영역에 제거 대상 패턴이 남아있지 않음을 확인
3. **Task 9 실브라우저 QA** — 3해상도 육안 확인

예외는 Task 4 의 `club-detail-about.test.tsx` 한 건이다. 기존 테스트가 보더 클래스를 단언하고 있어 **먼저 테스트를 고쳐 실패시키고**(RED) 구현으로 통과시킨다(GREEN).

---

### Task 1: 히어로 `DU` / `ING` 제거

**Files:**
- Modify: `frontend/apps/web/app/_components/sections/HomeHero.tsx:60-91`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (다른 태스크가 의존하지 않음)

**참고:** 이 변경은 이미 워킹 트리에 적용돼 있을 수 있다. `git diff` 로 확인하고, 이미 적용됐으면 Step 1~2 를 건너뛰고 Step 3 부터 진행한다.

- [ ] **Step 1: 보조 텍스트 블록과 래퍼 제거**

`<h1>` 안의 "두잉" 부분을 아래 before → after 로 바꾼다.

before:
```tsx
            <span className="relative inline-block pb-[22px]">
              <span className="relative inline-block">
                <span className="text-ink-deep">두</span>
                <span className="text-ink">잉</span>
                <SparkleFull
                  size={48}
                  color="#9DB6A0"
                  className="absolute -right-11 -top-2.5"
                />
              </span>
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-1 left-1 right-1 flex justify-between font-mono text-[11px] font-bold tracking-[0.16em] text-charcoal-3"
              >
                <span className="inline-flex flex-col items-center gap-[3px]">
                  <span className="h-px w-3.5 bg-charcoal-3 opacity-50" />
                  DU
                </span>
                <span className="inline-flex flex-col items-center gap-[3px]">
                  <span className="h-px w-3.5 bg-charcoal-3 opacity-50" />
                  ING
                </span>
              </span>
            </span>
```

after:
```tsx
            <span className="relative inline-block">
              <span className="text-ink-deep">두</span>
              <span className="text-ink">잉</span>
              <SparkleFull size={48} color="#9DB6A0" className="absolute -right-11 -top-2.5" />
            </span>
```

바깥 `relative inline-block pb-[22px]` 래퍼는 보조 텍스트의 위치 기준이자 그 아래 여백만 담당했으므로 접는다. 안쪽 `relative inline-block` 은 `SparkleFull` 의 위치 기준이라 **반드시 남긴다.**

- [ ] **Step 2: 히어로 배지가 그대로인지 확인**

55~58행의 `DU + ING` 배지는 **별개 요소이며 유지 대상**이다. 아래 명령으로 살아있는지 확인한다.

Run:
```bash
cd frontend && grep -n "DU + ING" apps/web/app/_components/sections/HomeHero.tsx
```
Expected: 1건 출력 (`<Sparkle size={11} color="#143025" />` 아래 줄)

- [ ] **Step 3: 잔여 확인**

Run:
```bash
cd frontend && grep -nE "^\s+(DU|ING)$|h-px w-3.5|pb-\[22px\]" apps/web/app/_components/sections/HomeHero.tsx
```
Expected: 출력 없음

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/home/home-hero.test.tsx
```
Expected: PASS (기존 테스트에 `DU` / `ING` 단언이 없어 수정 불필요)

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components/sections/HomeHero.tsx
git commit -m "feat(frontend): 히어로 타이틀 아래 DU/ING 보조 텍스트와 장식 라인을 없앤다"
```

---

### Task 2: 디자인 시스템 규칙 개정 + 공용 프리미티브

**Files:**
- Modify: `frontend/DESIGN.md:6`, `:135`, `:160`, `:244-251`, `:293`
- Modify: `frontend/apps/web/components/ui/tabs.tsx:23,37`
- Modify: `frontend/apps/web/components/Accordion.tsx:60`

**Interfaces:**
- Consumes: 없음
- Produces: `TabsList` 가 더 이상 `border-b border-line` 을 갖지 않고, `TabsTrigger` 가 `-mb-[1.5px]` 를 갖지 않는다. Task 3~8 의 개별 탭 레일이 같은 형태를 따른다.

- [ ] **Step 1: `DESIGN.md` L6 — 헤어라인의 역할을 컴포넌트 정의로 한정**

`깊이는 두꺼운 테두리가 아니라 1px 웜그레이 헤어라인(#E5E2DA)과 잉크색 틴트 소프트 섀도, 그리고 인라인 rotate 로 기울인 카드 콜라주가 만든다.`
→
`깊이는 두꺼운 테두리가 아니라 1px 웜그레이 헤어라인(#E5E2DA)이 그리는 컴포넌트 윤곽과 잉크색 틴트 소프트 섀도, 그리고 인라인 rotate 로 기울인 카드 콜라주가 만든다. 헤어라인은 카드·버튼·인풋의 경계와 표의 행을 그릴 때만 쓴다 — 섹션과 섹션 사이는 여백이 가른다.`

- [ ] **Step 2: `DESIGN.md` L135 — 카드 푸터 점선 시그니처 삭제**

`카드 푸터는 **점선 구분선** \`border-t border-dashed border-line pt-3\` 가 시그니처.`
→
`카드 푸터는 구분선 없이 \`pt-3\` 여백으로만 띄운다.`

- [ ] **Step 3: `DESIGN.md` L160 — Nav Bar 하단 헤어라인 삭제**

`\`relative z-50 border-b border-line bg-cream/90 backdrop-blur\` — 반투명 크림 + 블러 + 하단 헤어라인.`
→
`\`relative z-50 bg-cream/90 backdrop-blur\` — 반투명 크림 + 블러. 하단 구분선 없음 — 본문과는 여백으로 나뉜다.`

- [ ] **Step 4: `DESIGN.md` L293 — 표준 카드 레시피 푸터 수정**

`푸터 \`border-t border-dashed border-line pt-3\` 양끝 정렬.`
→
`푸터 \`pt-3\` 양끝 정렬(구분선 없음).`

- [ ] **Step 5: `DESIGN.md` Don't 목록에 규칙 신설**

L245 (`- \`border-2 border-black\`, 하드 드롭섀도…`) **바로 위에** 다음 줄을 삽입한다.

```markdown
- 섹션과 섹션 사이에 가로 구분선을 긋지 않는다 — 헤더↔본문, 히어로↔콘텐츠, 필터↔목록, 카드 안 블록 사이는 전부 여백이 가른다. 가로선은 표의 행, 목록의 행, 모달·시트의 고정 chrome, 컴포넌트 외곽선에만 쓴다
```

- [ ] **Step 6: `components/ui/tabs.tsx` — 탭 레일 받침선과 음수 마진 제거**

23행:
```tsx
      className={cn('flex gap-8 border-b border-line', className)}
```
→
```tsx
      className={cn('flex gap-8', className)}
```

37행:
```tsx
        '-mb-[1.5px] border-b-[2.5px] border-transparent px-0 py-3.5 text-[15px] font-semibold text-charcoal-3 transition-colors',
```
→
```tsx
        'border-b-[2.5px] border-transparent px-0 py-3.5 text-[15px] font-semibold text-charcoal-3 transition-colors',
```

`border-b-[2.5px] border-transparent` 과 `data-[state=active]:border-ink` 는 활성 표시라 **유지한다.** 받침선이 사라지면서 겹침 보정용 `-mb-[1.5px]` 만 불필요해진다.

- [ ] **Step 7: `components/Accordion.tsx:60` — 아코디언 본문 점선 제거**

```tsx
          <div className="border-t border-dashed border-line pb-5 pt-3.5 text-[14px] leading-[1.65] text-charcoal-2">
```
→
```tsx
          <div className="pb-5 pt-3.5 text-[14px] leading-[1.65] text-charcoal-2">
```

- [ ] **Step 8: 타입체크·테스트 실행**

Run:
```bash
cd frontend && pnpm typecheck && pnpm test
```
Expected: typecheck PASS, 테스트 전부 PASS (이 시점엔 `club-detail-about.test.tsx` 도 아직 통과 — Task 4 에서 다룬다)

- [ ] **Step 9: 커밋**

```bash
git add frontend/DESIGN.md frontend/apps/web/components/ui/tabs.tsx frontend/apps/web/components/Accordion.tsx
git commit -m "refactor(frontend): 섹션 구분선 금지 규칙을 디자인 문서에 박고 공용 탭·아코디언에 적용한다"
```

---

### Task 3: 전역 셸 — 네비 · 푸터 · 홈 섹션

**Files:**
- Modify: `frontend/apps/web/app/_components/HomeNav.tsx:93`
- Modify: `frontend/apps/web/app/_components/ExploreNav.tsx:59`
- Modify: `frontend/apps/web/app/_components/InfoTabs.tsx:27,40`
- Modify: `frontend/apps/web/app/_components/HomeFooter.tsx:10,16,37,114`
- Modify: `frontend/apps/web/app/_components/sections/HomeMobileSearchBar.tsx:11`
- Modify: `frontend/apps/web/app/_components/sections/HomeFaqAccordion.tsx:63`
- Modify: `frontend/apps/web/app/_components/sections/FeaturedClubs.tsx:110`
- Modify: `frontend/apps/web/app/_components/sections/Categories.tsx:119`

**Interfaces:**
- Consumes: Task 2 의 탭 레일 형태(받침선 없음 + 음수 마진 없음)
- Produces: 없음

- [ ] **Step 1: 제거 대상 8개 파일 편집**

각 행에서 **제거할 클래스 토막**만 지운다. 나머지 클래스와 속성은 그대로 둔다.

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/_components/HomeNav.tsx` | 93 | `border-b border-line ` |
| `app/_components/ExploreNav.tsx` | 59 | ` border-b border-line` (문자열 `'z-50 bg-cream/90 backdrop-blur border-b border-line',` 안) |
| `app/_components/InfoTabs.tsx` | 27 | `border-b border-line ` |
| `app/_components/InfoTabs.tsx` | 40 | `-mb-px ` (활성 표시 `border-b-[2.5px]` 는 유지) |
| `app/_components/HomeFooter.tsx` | 10 | `border-t border-line ` |
| `app/_components/HomeFooter.tsx` | 16 | `border-t border-line ` |
| `app/_components/HomeFooter.tsx` | 37 | `border-t border-line ` |
| `app/_components/HomeFooter.tsx` | 114 | `border-t border-line ` |
| `app/_components/sections/HomeMobileSearchBar.tsx` | 11 | `border-b border-line ` |
| `app/_components/sections/HomeFaqAccordion.tsx` | 63 | `border-t border-dashed border-line ` |
| `app/_components/sections/FeaturedClubs.tsx` | 110 | `border-t border-dashed border-line ` |

- [ ] **Step 2: `Categories.tsx:119` — 클래스와 죽은 인라인 스타일 함께 정리**

before:
```tsx
      <div
        className="relative overflow-hidden border-b"
        style={{ height: 170, borderColor: '#e6e1d2', background: category.fallbackBg }}
      >
```
after:
```tsx
      <div
        className="relative overflow-hidden"
        style={{ height: 170, background: category.fallbackBg }}
      >
```

`borderColor` 는 `border-b` 가 사라지면 아무 데도 적용되지 않는 죽은 값이라 함께 지운다. `height` 와 `background` 는 레이아웃·배경이라 **유지한다.**

- [ ] **Step 3: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" \
  apps/web/app/_components/HomeNav.tsx \
  apps/web/app/_components/ExploreNav.tsx \
  apps/web/app/_components/InfoTabs.tsx \
  apps/web/app/_components/HomeFooter.tsx \
  apps/web/app/_components/sections/HomeMobileSearchBar.tsx \
  apps/web/app/_components/sections/HomeFaqAccordion.tsx \
  apps/web/app/_components/sections/FeaturedClubs.tsx \
  apps/web/app/_components/sections/Categories.tsx | grep -vE "border-(transparent|box)"
```
Expected: `InfoTabs.tsx:40` 의 활성 표시 `border-b-[2.5px]` 1건과 `Categories.tsx` 의 hover 밑줄 `border-b border-transparent`(grep 에서 제외됨) 외에는 출력 없음

- [ ] **Step 4: 테스트 실행**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/home test/sections test/notices
```
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/apps/web/app/_components
git commit -m "refactor(frontend): 전역 네비·푸터·홈 섹션의 가로 구분선을 걷어낸다"
```

---

### Task 4: 동아리 탐색 · 상세

**Files:**
- Modify: `frontend/apps/web/app/clubs/_pages/ClubExplorePage.tsx:188,523,541,550`
- Modify: `frontend/apps/web/app/clubs/_components/ClubExploreSkeleton.tsx:71,87`
- Modify: `frontend/apps/web/app/clubs/_components/ClubCard.tsx:153`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailHero.tsx:34`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubDetailAbout.tsx:77,122`
- Modify: `frontend/apps/web/app/clubs/[clubId]/_components/ClubRecruitmentSummary.tsx:79`
- Modify: `frontend/apps/web/app/clubs/[clubId]/member/_components/MemberPageHeader.tsx:28`
- Test: `frontend/apps/web/test/clubs/club-detail-about.test.tsx:100-111`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 기존 테스트를 새 기대값으로 고쳐 실패시킨다 (RED)**

`club-detail-about.test.tsx` 100~111행을 아래로 교체한다. 두 테스트가 지키려는 건 "본문이 있을 때만 추천 영역을 분리한다"는 조건부 렌더 로직이고, 보더는 관찰 수단일 뿐이었다. 관찰 수단만 여백 클래스로 바꾼다.

before:
```tsx
  it('본문·highlights 가 모두 있으면 추천 영역 앞에 구분선을 둔다', () => {
    render(<ClubDetailAbout description="본문" highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).toHaveClass('border-t');
  });

  it('본문 없이 highlights 만 있으면 구분선 없이 추천 영역만 렌더한다', () => {
    render(<ClubDetailAbout description={null} highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).not.toHaveClass('border-t');
    expect(screen.getByText('성장하고 싶은 사람')).toBeInTheDocument();
  });
```

after:
```tsx
  it('본문·highlights 가 모두 있으면 추천 영역 앞에 여백을 둔다', () => {
    render(<ClubDetailAbout description="본문" highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).toHaveClass('mt-5');
    expect(subtitle.parentElement).not.toHaveClass('border-t');
  });

  it('본문 없이 highlights 만 있으면 여백 없이 추천 영역만 렌더한다', () => {
    render(<ClubDetailAbout description={null} highlights={['성장하고 싶은 사람']} />);
    const subtitle = screen.getByText('이런 분께 추천해요');
    expect(subtitle.parentElement).not.toHaveClass('mt-5');
    expect(screen.getByText('성장하고 싶은 사람')).toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/clubs/club-detail-about.test.tsx
```
Expected: FAIL — 첫 테스트가 `expect(element).not.toHaveClass('border-t')` 에서 실패한다 (아직 `border-t` 가 붙어 있음)

- [ ] **Step 3: `ClubDetailAbout.tsx` 두 곳 수정 (GREEN)**

77행:
```tsx
            <div className="mt-5 border-t border-line pt-5">
```
→
```tsx
            <div className="mt-5 pt-5">
```

122행:
```tsx
          <div className={cn(description !== null && 'mt-5 border-t border-line pt-5')}>
```
→
```tsx
          <div className={cn(description !== null && 'mt-5 pt-5')}>
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/clubs/club-detail-about.test.tsx
```
Expected: PASS

- [ ] **Step 5: 나머지 탐색·상세 파일 편집**

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/clubs/_pages/ClubExplorePage.tsx` | 188 | `border-b border-line ` |
| `app/clubs/_pages/ClubExplorePage.tsx` | 523 | `border-b border-line ` |
| `app/clubs/_pages/ClubExplorePage.tsx` | 541 | `border-b border-line ` (탭 레일 `<nav>`) |
| `app/clubs/_pages/ClubExplorePage.tsx` | 550 | `-mb-px ` |
| `app/clubs/_components/ClubExploreSkeleton.tsx` | 71 | `border-b border-line ` |
| `app/clubs/_components/ClubExploreSkeleton.tsx` | 87 | `border-b border-line ` |
| `app/clubs/_components/ClubCard.tsx` | 153 | `border-t border-dashed border-line ` |
| `app/clubs/[clubId]/_components/ClubDetailHero.tsx` | 34 | `border-b border-line ` |
| `app/clubs/[clubId]/_components/ClubRecruitmentSummary.tsx` | 79 | `border-t border-ink/10 ` |
| `app/clubs/[clubId]/member/_components/MemberPageHeader.tsx` | 28 | ` border-b border-line` |

`ClubExplorePage.tsx` 의 762·793 행(필터 시트 행 구분선), `ClubRecruitmentCard.tsx:119`, `ClubDetailApplyBar.tsx:54`(고정 하단바), 735 행(시트 푸터)은 **유지 대상이다. 건드리지 않는다.**

스켈레톤(`ClubExploreSkeleton`)은 본문(`ClubExplorePage`)과 시각적으로 일치해야 하므로 반드시 함께 바꾼다.

- [ ] **Step 6: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" apps/web/app/clubs | grep -vE "border-(transparent|box)"
```
Expected: 아래 유지 대상만 출력된다 — `ClubExplorePage.tsx` 550(활성 표시)·735(시트 푸터)·762·793(행 구분선), `ClubRecruitmentCard.tsx` 119(행 구분선), `ClubDetailApplyBar.tsx` 54(고정 하단바), `MemberPageHeader.tsx` 37(활성 표시), `ClubEventFormModal.tsx` 169·`ClubNoticeFormModal.tsx` 187(모달 푸터)

- [ ] **Step 7: 테스트 실행**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/clubs
```
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add frontend/apps/web/app/clubs frontend/apps/web/test/clubs/club-detail-about.test.tsx
git commit -m "refactor(frontend): 동아리 탐색·상세의 섹션 구분선을 여백으로 대체한다"
```

---

### Task 5: 콘텐츠 페이지 — 공지 · FAQ · 소개 · 약관 · 시설 · 캘린더

**Files:**
- Modify: `frontend/apps/web/app/notices/_components/NoticeArticleHeader.tsx:32`
- Modify: `frontend/apps/web/app/notices/_components/NoticeMetaCard.tsx:36`
- Modify: `frontend/apps/web/app/faq/_pages/FaqPage.tsx:91`
- Modify: `frontend/apps/web/app/faq/_components/FaqFeedback.tsx:56`
- Modify: `frontend/apps/web/app/terms/page.tsx:51,149`
- Modify: `frontend/apps/web/app/introduce/_components/sections/{Problem,Solution,Features,StudentExperience,BeforeAfter,Faq,Cta}.tsx`
- Modify: `frontend/apps/web/app/introduce/_components/FeatureRow.tsx:34`
- Modify: `frontend/apps/web/app/facilities/_components/FacilityUsageGuide.tsx:48`
- Modify: `frontend/apps/web/app/facilities/_components/booking/DayBookingOverview.tsx:51,64`
- Modify: `frontend/apps/web/app/calendar/_components/EventDetailModal.tsx:101,109`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 단순 토막 제거 (13곳)**

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/notices/_components/NoticeArticleHeader.tsx` | 32 | ` border-b border-line` |
| `app/notices/_components/NoticeMetaCard.tsx` | 36 | ` border-t border-dashed border-line` |
| `app/faq/_pages/FaqPage.tsx` | 91 | `border-t border-dashed border-line ` |
| `app/faq/_components/FaqFeedback.tsx` | 56 | `border-t border-dashed border-line ` |
| `app/terms/page.tsx` | 51 | `border-b border-line ` |
| `app/terms/page.tsx` | 149 | `border-b border-line ` |
| `app/introduce/_components/sections/Problem.tsx` | 27 | `border-t border-line ` |
| `app/introduce/_components/sections/Solution.tsx` | 26 | `border-t border-line ` |
| `app/introduce/_components/sections/Features.tsx` | 9 | `border-t border-line ` |
| `app/introduce/_components/sections/StudentExperience.tsx` | 9 | `border-t border-line ` |
| `app/introduce/_components/sections/BeforeAfter.tsx` | 23 | `border-t border-line ` |
| `app/introduce/_components/sections/BeforeAfter.tsx` | 85 | `border-t border-dashed border-line ` |
| `app/introduce/_components/sections/Faq.tsx` | 35 | `border-t border-line ` |
| `app/introduce/_components/sections/Cta.tsx` | 8 | `border-t border-line ` |
| `app/facilities/_components/FacilityUsageGuide.tsx` | 48 | `border-t border-line ` |
| `app/calendar/_components/EventDetailModal.tsx` | 101 | `border-t border-line ` |
| `app/calendar/_components/EventDetailModal.tsx` | 109 | `border-t border-line ` |

`terms/page.tsx` 의 `pb-3` 은 제목 아래 여백이라 **유지한다.**
`EventDetailModal.tsx:75`(모달 푸터 액션 행)은 **유지 대상이다. 건드리지 않는다.** 101·109 는 모달 *본문* 안의 섹션 구분선이라 제거 대상이며, 101 은 109 의 로딩 스켈레톤이므로 반드시 함께 바꾼다.

- [ ] **Step 2: `FeatureRow.tsx:34` — 사문화되는 `last:border-b-0` 도 함께 제거**

before:
```tsx
    <div className="grid items-center gap-10 border-b border-dashed border-line py-12 last:border-b-0 md:grid-cols-2 md:gap-16 md:py-16">
```
after:
```tsx
    <div className="grid items-center gap-10 py-12 md:grid-cols-2 md:gap-16 md:py-16">
```

- [ ] **Step 3: `DayBookingOverview.tsx` — 조건부 클래스에서 보더만 빼고 여백은 남긴다**

51행:
```tsx
        <ul className={`mt-2 flex flex-col gap-1.5 ${usage.length > 0 ? 'border-t border-dashed border-line pt-2' : ''}`}>
```
→
```tsx
        <ul className={`mt-2 flex flex-col gap-1.5 ${usage.length > 0 ? 'pt-2' : ''}`}>
```

64행:
```tsx
        className={`mt-2 space-y-1.5 ${usage.length > 0 || available.length > 0 ? 'border-t border-dashed border-line pt-2' : ''}`}
```
→
```tsx
        className={`mt-2 space-y-1.5 ${usage.length > 0 || available.length > 0 ? 'pt-2' : ''}`}
```

- [ ] **Step 4: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" \
  apps/web/app/notices apps/web/app/faq apps/web/app/terms \
  apps/web/app/introduce apps/web/app/facilities apps/web/app/calendar \
  | grep -vE "border-(transparent|box)"
```
Expected: 아래 유지 대상만 출력된다 — `notices/_components/RelatedNotices.tsx` 29·`NoticeEventSummary.tsx` 22(행 구분선), `NoticeDetailLinkBar.tsx` 23(고정 하단바), `introduce/_components/sections/Hero.tsx` 89(`두잉` 밑줄 장식), `introduce/_components/mockups/{AdminMockup,FeesMockup}.tsx`(목업 표 행), `facilities/_components/booking/{WeekTimetable,DaySlotList,BookingPanel}.tsx`(셀 보더·고정 하단바), `calendar/_components/EventDetailModal.tsx` 75(모달 푸터)

- [ ] **Step 5: 테스트 실행**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/notices test/faq test/facilities test/sections
```
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/notices frontend/apps/web/app/faq frontend/apps/web/app/terms \
        frontend/apps/web/app/introduce frontend/apps/web/app/facilities frontend/apps/web/app/calendar
git commit -m "refactor(frontend): 공지·FAQ·소개·약관·시설·캘린더의 섹션 구분선을 걷어낸다"
```

---

### Task 6: 마이페이지 · 설정

**Files:**
- Modify: `frontend/apps/web/app/me/_components/MyPageTabs.tsx:20`
- Modify: `frontend/apps/web/app/me/_components/MyPageStickyNav.tsx:20`
- Modify: `frontend/apps/web/app/me/_components/SectionSaved.tsx:96`
- Modify: `frontend/apps/web/app/me/_components/SectionActivity.tsx:59`
- Modify: `frontend/apps/web/app/me/settings/_pages/SettingsPage.tsx:54,80`
- Modify: `frontend/apps/web/app/me/settings/_components/SessionListCard.tsx:104`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 6개 파일 편집**

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/me/_components/MyPageTabs.tsx` | 20 | ` border-b border-line` (탭 레일) |
| `app/me/_components/MyPageStickyNav.tsx` | 20 | ` border-b border-line` (탭 레일) |
| `app/me/_components/SectionSaved.tsx` | 96 | ` border-t border-line` (카드 푸터) |
| `app/me/_components/SectionActivity.tsx` | 59 | `border-b border-line ` (카드 헤더) |
| `app/me/settings/_pages/SettingsPage.tsx` | 54 | ` border-b border-line` (`SettingsCard` 헤더) |
| `app/me/settings/_pages/SettingsPage.tsx` | 80 | `border-b border-line ` (탭 레일 `<nav>`) |
| `app/me/settings/_components/SessionListCard.tsx` | 104 | ` border-b border-line` (카드 헤더) |

`SettingsPage.tsx:54` 의 `style={danger ? { background: ... } : undefined}` 는 배경이라 **유지한다.**
`SettingsPage.tsx:33` 과 `SessionListCard.tsx:47`(둘 다 `py-4 border-b border-line` 목록 행)은 **유지 대상이다. 건드리지 않는다.**
`MyPageTabs.tsx` 32~33 행과 `MyPageStickyNav.tsx` 43~44 행, `SettingsPage.tsx` 102~103 행의 `border-b-[2.5px]` 는 활성 표시라 유지한다. 이 세 파일엔 음수 마진이 없으므로 추가 정리도 없다.

- [ ] **Step 2: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" apps/web/app/me | grep -vE "border-(transparent|box)"
```
Expected: 활성 표시 `border-b-[2.5px]`(`MyPageTabs` 32, `MyPageStickyNav` 43, `SettingsPage` 102) 3건 + 목록 행선(`SettingsPage` 33, `SessionListCard` 47) 2건만 출력

- [ ] **Step 3: 테스트 실행**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/me
```
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/me
git commit -m "refactor(frontend): 마이페이지·설정의 탭 받침선과 카드 내부 구분선을 없앤다"
```

---

### Task 7: 동아리 운영 콘솔 (`/manage`)

**Files:**
- Modify: `frontend/apps/web/app/manage/_components/ManageShell.tsx:122`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_pages/ClubFeesPage.tsx:60,138`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/fees/_components/BankReviewQueue.tsx:198,224`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/info/_components/ProjectsRepeater.tsx:75`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/members/_components/MemberTable.tsx:208`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/facility-bookings/_components/FacilityBookingsView.tsx:51`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page.tsx:310`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/ApplicantTable.tsx:207`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/[roundId]/_components/RoundMemberTable.tsx:28`
- Modify: `frontend/apps/web/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/new/_components/{Step1Candidates,Step2RoundForm,Step3Slots,Step4Review}.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 14곳 편집**

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/manage/_components/ManageShell.tsx` | 122 | `border-t border-white/10 ` |
| `.../fees/_pages/ClubFeesPage.tsx` | 138 | ` border-b border-line` (탭 레일) |
| `.../fees/_pages/ClubFeesPage.tsx` | 60 | `-mb-px ` |
| `.../fees/_components/BankReviewQueue.tsx` | 198 | `border-t border-line ` |
| `.../fees/_components/BankReviewQueue.tsx` | 224 | `border-t border-line ` |
| `.../info/_components/ProjectsRepeater.tsx` | 75 | `border-t border-[#f0ede3] ` |
| `.../members/_components/MemberTable.tsx` | 208 | `border-t border-line ` |
| `.../facility-bookings/_components/FacilityBookingsView.tsx` | 51 | ` border-b border-line` (탭 레일) |
| `.../applicants/page.tsx` | 310 | `border-t border-slate-100 ` |
| `.../applicants/_components/ApplicantTable.tsx` | 207 | `border-t border-slate-100 ` |
| `.../interview/rounds/[roundId]/_components/RoundMemberTable.tsx` | 28 | ` border-b border-slate-100` |
| `.../interview/rounds/new/_components/Step1Candidates.tsx` | 94 | ` border-b border-slate-200` |
| `.../interview/rounds/new/_components/Step1Candidates.tsx` | 204 | `border-t border-slate-200 ` |
| `.../interview/rounds/new/_components/Step2RoundForm.tsx` | 187 | `border-t border-slate-200 ` |
| `.../interview/rounds/new/_components/Step3Slots.tsx` | 99 | `border-t border-slate-200 ` |
| `.../interview/rounds/new/_components/Step4Review.tsx` | 142 | `border-t border-slate-200 ` |

`BankReviewQueue.tsx` 198·224 는 `hasCandidates` 삼항의 두 분기라 **반드시 함께** 바꾼다. 한쪽만 바꾸면 분기에 따라 선이 나타났다 사라진다.
`ClubFeesPage.tsx:63` 의 `border-transparent`(비활성 탭)와 62행의 활성 표시는 유지한다.
`MemberBulkToolbar.tsx:163`, `BulkActionBar.tsx:32`(둘 다 고정 하단 액션 바), `MemberDetailPanel.tsx:162`(시트/다이얼로그 공용 헤더), `MyEvaluationCard.tsx` 의 `border border-blue-200`(외곽선)은 **유지 대상이다. 건드리지 않는다.**

- [ ] **Step 2: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" apps/web/app/manage | grep -vE "border-(transparent|box|blue)"
```
Expected: 유지 대상만 출력 — `ClubFeesPage.tsx` 60(활성 표시), `MemberDetailPanel.tsx` 162(시트 헤더), `MemberBulkToolbar.tsx` 163·`BulkActionBar.tsx` 32(고정 하단바)

- [ ] **Step 3: 테스트 실행**

Run:
```bash
cd frontend && pnpm --filter @duing/web exec vitest run test/manage
```
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add frontend/apps/web/app/manage
git commit -m "refactor(frontend): 동아리 운영 콘솔의 카드·스텝 폼 내부 구분선을 없앤다"
```

---

### Task 8: 총동연 관리자 콘솔 (`/admin`)

**Files:**
- Modify: `frontend/apps/web/app/admin/_components/AdminSidebar.tsx:122`
- Modify: `frontend/apps/web/app/admin/_components/AdminMobileBar.tsx:26`
- Modify: `frontend/apps/web/app/admin/users/_pages/AdminUsersPage.tsx:181`
- Modify: `frontend/apps/web/app/admin/users/_components/AdminUserDetailSheet.tsx:285`
- Modify: `frontend/apps/web/app/admin/inquiries/[inquiryId]/_pages/AdminInquiryDetailPage.tsx:333`
- Modify: `frontend/apps/web/app/admin/promotion-requests/_pages/AdminPromotionRequestDetailPage.tsx:173`
- Modify: `frontend/apps/web/app/admin/leader-succession/_pages/AdminSuccessionDetailPage.tsx:111`
- Modify: `frontend/apps/web/app/admin/reports/_pages/AdminReportDetailPage.tsx:113`
- Modify: `frontend/apps/web/app/admin/faqs/_components/FaqCategoryManager.tsx:123,190`
- Modify: `frontend/apps/web/app/admin/faqs/_components/FaqSearchMissPanel.tsx:53`
- Modify: `frontend/apps/web/app/admin/facility-bookings/_tabs/{BookingManagementTab,SubmissionPrepareTab,SubmissionBatchesTab}.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/_components/{ClubRosterAccordion,SubmissionClubGroupList}.tsx`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx:254`
- Modify: `frontend/apps/web/app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx:103,155,190`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 단순 토막 제거 (19곳)**

| 파일 | 라인 | 제거할 토막 |
|---|---|---|
| `app/admin/_components/AdminSidebar.tsx` | 122 | `border-t border-line ` |
| `app/admin/_components/AdminMobileBar.tsx` | 26 | `border-b border-line ` |
| `app/admin/users/_pages/AdminUsersPage.tsx` | 181 | `border-t border-line ` |
| `app/admin/users/_components/AdminUserDetailSheet.tsx` | 285 | `border-b border-danger/20 ` |
| `app/admin/inquiries/[inquiryId]/_pages/AdminInquiryDetailPage.tsx` | 333 | `border-t border-line ` |
| `app/admin/promotion-requests/_pages/AdminPromotionRequestDetailPage.tsx` | 173 | ` border-t border-line` |
| `app/admin/leader-succession/_pages/AdminSuccessionDetailPage.tsx` | 111 | ` border-t border-line` |
| `app/admin/reports/_pages/AdminReportDetailPage.tsx` | 113 | ` border-t border-line` |
| `app/admin/faqs/_components/FaqCategoryManager.tsx` | 123 | `border-t border-line ` |
| `app/admin/faqs/_components/FaqCategoryManager.tsx` | 190 | `border-t border-line ` |
| `app/admin/faqs/_components/FaqSearchMissPanel.tsx` | 53 | `border-t border-line ` |
| `app/admin/facility-bookings/_tabs/BookingManagementTab.tsx` | 144 | `border-b border-line ` |
| `app/admin/facility-bookings/_tabs/BookingManagementTab.tsx` | 237 | `border-t border-line ` |
| `app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` | 213 | `border-b border-line ` |
| `app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` | 266 | `border-b border-line ` |
| `app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx` | 266 | `border-t border-line ` |
| `app/admin/facility-bookings/submission/_components/ClubRosterAccordion.tsx` | 66 | `border-t border-line ` |
| `.../transcribe/_pages/TranscribeCockpitPage.tsx` | 103 | `border-b border-line ` |
| `.../transcribe/_pages/TranscribeCockpitPage.tsx` | 155 | `border-t border-line ` |
| `.../transcribe/_pages/TranscribeCockpitPage.tsx` | 190 | `border-b border-line ` |

`AdminUserDetailSheet.tsx:118`(시트 헤더), `AdminBookingDetailModal.tsx` 256·474(모달 헤더/푸터)와 313·318·322(2열 격자 = 표), `AdminBookingQueueTable.tsx:40`·`SubmissionBatchesTab.tsx:165`(테이블 행선), 각 `Admin*Table.tsx` 의 `<tr>` 행선, `FaqSearchMissPanel.tsx:74`(테이블 행선), `AdminFaqListPage.tsx:213`·`AdminInquiriesListPage.tsx:135`(테이블 행선), `SubmissionClubGroupList.tsx:83`·`SubmissionBatchDetailPage.tsx:256`(목록 행선)은 **전부 유지 대상이다. 건드리지 않는다.**

- [ ] **Step 2: `<ul>` 상단선 2곳 — 행 구분선과 헷갈리지 않게 정확히 지운다**

`app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx:79`:
```tsx
              <ul className="border-t border-line/60">
```
→
```tsx
              <ul>
```

`app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx:254`:
```tsx
                      <ul className="border-t border-line/60">
```
→
```tsx
                      <ul>
```

바로 아래 `<li>` 의 `border-b border-line/40 ... last:border-b-0` 은 **목록 행 구분선이라 유지한다.**

- [ ] **Step 3: `SubmissionPrepareTab.tsx:333` — 시설 그룹 띠 제거로 `className` 자체가 사라진다**

before:
```tsx
                    <li
                      key={section.facilityId}
                      className={sectionIndex < sections.length - 1 ? 'border-b-8 border-graysoft' : ''}
                    >
```
after:
```tsx
                    <li key={section.facilityId}>
```

`sectionIndex` 가 이 `className` 에서만 쓰이는지 확인하고, 다른 곳에서 쓰이지 않으면 `map((section, sectionIndex) =>` 의 두 번째 인자도 제거해 lint 경고를 막는다. 쓰이면 그대로 둔다.

- [ ] **Step 4: 잔여 grep 가드**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" apps/web/app/admin | grep -vE "border-(transparent|box)"
```
Expected: 유지 대상만 출력 — 각 `Admin*Table.tsx` 의 `<tr>`/`thead` 행선, `AdminBookingDetailModal.tsx` 256·313·318·322·474, `AdminUserDetailSheet.tsx` 118, `AdminBookingQueueTable.tsx` 40, `SubmissionBatchesTab.tsx` 165, `FaqSearchMissPanel.tsx` 74, `AdminFaqListPage.tsx` 213, `AdminInquiriesListPage.tsx` 135, `SubmissionClubGroupList.tsx` 83, `SubmissionBatchDetailPage.tsx` 256, `AdminClubMemberHistoryTable.tsx` 36, `AdminPromotionRequestsTable.tsx` 41, `AdminGlobalEventTable.tsx` 37, `AdminNoticesTable.tsx` 29, `AdminPromotionsTable.tsx` 50, `AdminUsersTable.tsx` 78, `AdminSuccessionTable.tsx` 37, `AdminReportsTable.tsx` 39, `AdminClubsTable.tsx` 35·55·134

- [ ] **Step 5: lint · 테스트 실행**

Run:
```bash
cd frontend && pnpm lint && pnpm --filter @duing/web exec vitest run test/admin
```
Expected: 둘 다 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/apps/web/app/admin
git commit -m "refactor(frontend): 총동연 콘솔의 패널 내부 구분선과 시설 그룹 띠를 없앤다"
```

---

### Task 9: 통합 검증 + 실브라우저 QA + 여백 보정

**Files:**
- Modify: QA 결과에 따라 여백이 부족한 파일만 (사전에 지정 불가 — 실측 후 결정)

**Interfaces:**
- Consumes: Task 1~8 의 모든 변경
- Produces: 최종 상태

- [ ] **Step 1: 전체 빌드·검사 실행**

Run:
```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
Expected: 4개 전부 성공. `pnpm build` 는 출력에서 `Compiled successfully` 를 눈으로 확인한다 (`| tail` 로 파이프하면 exit code 가 가려지므로 쓰지 않는다).

- [ ] **Step 2: 전역 잔여 grep — 제거 대상이 하나도 남지 않았는지 확인**

Run:
```bash
cd frontend && grep -rnE "border-(t|b)[-\"' []" --include='*.tsx' --include='*.ts' apps packages \
  | grep -v node_modules | grep -v '/test/' \
  | grep -vE "border-(transparent|box|blue|black|bottom)" | wc -l
```
Expected: `69` (158 − 89). 숫자가 다르면 스펙의 "유지 대상" 목록과 대조해 어디가 어긋났는지 찾는다.

- [ ] **Step 3: 개발 서버 기동**

Run:
```bash
cd frontend && pnpm dev > /tmp/duing-dev.log 2>&1 &
```
로그를 파일로 리다이렉트한다. `| head` 로 파이프하면 파이프가 닫히면서 서버가 죽는다.
기동 후 `/tmp/duing-dev.log` 에서 `Local:` 줄을 확인해 실제 포트가 **3000** 인지 본다. 3001 로 밀렸다면 좀비 프로세스가 3000 을 잡고 있는 것이므로, 부모(`next dev`) → 워커(`next-server`) → 포트 순으로 정리하고 다시 띄운다.

- [ ] **Step 4: 3해상도 육안 QA**

Playwright MCP 로 **1440 / 768 / 390** 세 폭에서 아래 경로를 돈다.

공개: `/`, `/clubs`, `/clubs/{id}`, `/notices`, `/notices/{id}`, `/faq`, `/introduce`, `/terms`, `/facilities`, `/calendar`
개인: `/me`, `/me/settings`
운영: `/manage/clubs/{id}/members`, `/manage/clubs/{id}/fees`, `/manage/clubs/{id}/recruitments`
관리자: `/admin/users`, `/admin/facility-bookings`, `/admin/faqs`

중점 확인 항목:
1. 헤더·검색 바 아래 본문이 붙어 보이지 않는가 (`HomeNav`, `HomeMobileSearchBar`, `AdminMobileBar`)
2. 탭 레일에서 활성 표시가 1px 어긋나 보이지 않는가 (`-mb-px` 제거 결과)
3. `/admin/facility-bookings` 제출 준비 탭에서 시설 그룹이 서로 뭉개지지 않는가 (`border-b-8` 제거 결과 — 가장 위험)
4. `TranscribeCockpitPage` 3분할 밀도가 읽히는가
5. 카드 푸터(`ClubCard`, `FeaturedClubs`, `NoticeMetaCard`)가 본문과 붙어 보이지 않는가
6. 고정 하단 바와 `BottomNav` 의 상단선은 **그대로 살아있는가** (제거되면 회귀다)

- [ ] **Step 5: 여백 보정 — 실제로 붙어 보이는 곳만**

Step 4 에서 붙어 보인 지점만 여백을 한 단계 키운다. 추측으로 일괄 조정하지 않는다. 보정한 곳은 커밋 메시지에 적는다. 붙어 보이는 곳이 없으면 이 스텝은 건너뛴다.

- [ ] **Step 6: 개발 서버 정리**

Run:
```bash
pkill -f "next dev"; pkill -f "next-server"; lsof -ti:3000 | xargs -r kill
```
부모만 죽이면 워커가 살아남아 3000 을 계속 점유한다. 부모 → 워커 → 포트 순으로 정리한다.

- [ ] **Step 7: 커밋 (Step 5 에서 보정한 게 있을 때만)**

```bash
git add -A frontend/apps/web
git commit -m "fix(frontend): 구분선 제거 후 붙어 보이는 구간의 여백을 넓힌다"
```

- [ ] **Step 8: 최종 상태 보고**

`git log --oneline develop..HEAD` 와 `git diff --stat develop...HEAD` 를 출력해 사용자에게 보고한다. **push 와 PR 생성은 하지 않는다.** 사용자 지시를 기다린다.

---

## Self-Review 결과

**Spec coverage:** 스펙의 제거 대상 89곳이 Task 1~8 에 전부 배정됐다 — A(15) → Task 4·5, B(5) → Task 3·5·8, C(9) → Task 2·3·4·6·7, D(3) → Task 8, E(5) → Task 3·7, F(7) → Task 3·4·5·6, G(11) → Task 2·3·5·7·8, H(34) → Task 3~8. `DESIGN.md` 개정 5건은 Task 2. 히어로 `DU`/`ING` 는 Task 1. 테스트 영향 2건은 Task 4. 검증 4단계는 Task 9.

**Placeholder scan:** 각 스텝이 실제 before/after 코드 또는 파일:라인 + 제거할 정확한 문자열을 담고 있다. Task 9 Step 5 의 여백 보정만 사전 지정이 불가능한데, 이는 스펙의 여백 정책(실측 후 결정)이 그렇게 요구한 것이라 계획 결함이 아니다.

**Type consistency:** 코드 시그니처 변경이 없다. 유일한 인터페이스 변화는 Task 2 가 `TabsList` / `TabsTrigger` 의 클래스를 바꾸는 것이고, Task 3~8 의 개별 탭 레일이 같은 형태를 따르도록 각 태스크에 명시했다.
