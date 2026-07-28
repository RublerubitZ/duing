# 전 페이지 섹션 구분선 제거 — 설계

- 작성일: 2026-07-29
- 브랜치: `feat/divider-removal`
- 범위: `frontend/apps/web` 전체 + `frontend/DESIGN.md`

## 배경

서비스 전반에서 섹션과 섹션 사이를 가르는 가로 구분선(Divider)을 걷어내고, 여백만으로
콘텐츠를 구분하는 디자인으로 통일한다. 함께 메인 히어로 타이틀 "두잉" 아래의 `DU` / `ING`
보조 텍스트와 그 장식 라인을 제거한다.

전수 조사 결과 `border-t` / `border-b` 실사용은 **158곳**이다. `<hr>` 은 0건이고,
`Divider` / `Separator` 로 이름 붙은 컴포넌트는 `ToolbarDivider`(에디터 툴바의 세로 구분자)와
`DropdownMenuSeparator`(Radix 메뉴 내부) 둘뿐이라 이번 범위에 해당하지 않는다.
즉 이 작업은 **Tailwind 보더 유틸리티 정리**가 실체다.

## 디자인 시스템과의 충돌

`frontend/DESIGN.md` 가 스타일 SoT 인데, 제거 대상 중 일부가 문서에 **시그니처로 명문화**돼 있다.
코드만 고치면 다음 작업자가 문서를 보고 선을 되살린다. 문서 개정을 작업에 포함한다.

| 위치 | 현재 문구 | 조치 |
|---|---|---|
| L6 | "깊이는 두꺼운 테두리가 아니라 1px 웜그레이 헤어라인과 잉크색 틴트 소프트 섀도가 만든다" | 헤어라인의 역할을 **컴포넌트 정의 한정**으로 좁혀 재작성 |
| L135 | "카드 푸터는 **점선 구분선** `border-t border-dashed border-line pt-3` 가 시그니처" | 삭제 — 푸터는 여백으로 분리 |
| L293 | 표준 카드 레시피의 푸터 `border-t border-dashed border-line pt-3` | 삭제 |
| L160 | Nav Bar "반투명 크림 + 블러 + **하단 헤어라인**" | 하단 헤어라인 삭제 |
| L409 | BottomNav "상단 헤어라인 `border-t border-line`" | **유지** — 고정 오버레이 경계 |
| L233~245 Do's and Don'ts | — | "섹션 구분용 가로선 금지" 규칙 신설 |

## 판정 규칙

> **가로선은 컴포넌트를 정의할 때만 쓴다. 콘텐츠 블록을 가르는 데는 쓰지 않는다.**

| 대상 | 판정 | 근거 |
|---|---|---|
| 페이지 섹션·헤더·히어로·필터·푸터 경계 | 제거 | 블록 구분 |
| 카드 푸터 점선, 아코디언 구분선, 탭 레일 받침선 | 제거 | 장식성 블록 구분 |
| 카드·패널 내부 헤더선 / 섹션선 / 푸터선 | 제거 | 블록 구분 |
| 테이블 `<tr>` 행선·`thead` 하단선 | 유지 | 행이 곧 레코드 — 구조 |
| 목록 행 구분선 (`last:border-b-0` 계열) | 유지 | 테이블 행선에 준함 |
| 모달·시트·드롭다운 헤더/푸터선 | 유지 | 스크롤 본문이 고정 chrome 아래로 지나감 |
| 고정 하단 액션 바 · BottomNav `border-t` | 유지 | 반투명 오버레이 경계 |
| 카드·버튼·인풋 외곽선 | 유지 | 컴포넌트 정의 |
| 탭 활성 표시 `border-b-[2.5px] border-ink` | 유지 | 컨트롤 상태 |
| `<em>ing</em>` / `두잉` 밑줄 | 유지 | 타이포 장식 |

### 경계 판정 3건 (기록용)

- **`NoticeRichEditor` 툴바 하단선 — 유지.** 리치 에디터 툴바는 독립 컨트롤 서피스이고,
  그 보더가 툴바를 정의한다. 카드 내부 "정보 헤더"와 구분한다.
- **`AdminUserDetailSheet` "위험 작업" 헤더선 — 제거.** 컨트롤이 아니라 라벨 스트립이고,
  `pill-coral` 배경과 `bg-danger/[0.04]` 본문 배경이 이미 분리를 담당한다.
- **`AdminBookingDetailModal` 신청 정보 그리드 — 유지.** `border-b border-r` 로 짜인 2열
  격자는 표(table)이지 구분선이 아니다.

## 여백 정책

**선만 제거하고 `padding` / `margin` 은 손대지 않는다.** 대부분의 선은 이미 `mt-5 border-t pt-5`
처럼 여백을 끼고 있어 선을 빼도 40px 간격이 남는다. 여백 없이 선으로만 갈랐던 곳
(헤더 하단, 탭 레일, `border-b-8` 섹션 띠)만 실브라우저 QA에서 확인해 선별 보정한다.
추측으로 89곳 여백을 일괄 조정하면 "레이아웃 변경 금지" 조건과 충돌하고 회귀 위험이 크다.

## 제거 대상 — 전수 목록 (89곳 / 69개 파일)

경로는 `frontend/apps/web/` 기준.

### A. 페이지 섹션 경계 (15)

| 파일 | 라인 |
|---|---|
| `app/introduce/_components/sections/Problem.tsx` | 27 |
| `app/introduce/_components/sections/Solution.tsx` | 26 |
| `app/introduce/_components/sections/Features.tsx` | 9 |
| `app/introduce/_components/sections/StudentExperience.tsx` | 9 |
| `app/introduce/_components/sections/BeforeAfter.tsx` | 23 |
| `app/introduce/_components/sections/Faq.tsx` | 35 |
| `app/introduce/_components/sections/Cta.tsx` | 8 |
| `app/introduce/_components/FeatureRow.tsx` | 34 (+ 사문화되는 `last:border-b-0` 제거) |
| `app/terms/page.tsx` | 51, 149 (h2 밑줄) |
| `app/clubs/[clubId]/_components/ClubDetailHero.tsx` | 34 (Hero↔콘텐츠) |
| `app/clubs/_pages/ClubExplorePage.tsx` | 188, 523 |
| `app/clubs/_components/ClubExploreSkeleton.tsx` | 71, 87 (스켈레톤 = 본문과 동기화 필수) |

### B. 헤더 / 네비 하단 헤어라인 (5)

| 파일 | 라인 |
|---|---|
| `app/_components/HomeNav.tsx` | 93 |
| `app/_components/ExploreNav.tsx` | 59 |
| `app/_components/sections/HomeMobileSearchBar.tsx` | 11 |
| `app/admin/_components/AdminMobileBar.tsx` | 26 |
| `app/notices/_components/NoticeArticleHeader.tsx` | 32 |

### C. 탭 레일 받침선 (9) — 활성 표시는 유지, 음수 마진 동반 제거

| 파일 | 라인 | 동반 정리 |
|---|---|---|
| `components/ui/tabs.tsx` | 23 | `-mb-[1.5px]` (37) |
| `app/_components/InfoTabs.tsx` | 27 | `-mb-px` (40) |
| `app/clubs/_pages/ClubExplorePage.tsx` | 541 | `-mb-px` (550) |
| `app/manage/clubs/[clubId]/fees/_pages/ClubFeesPage.tsx` | 138 | `-mb-px` (60) |
| `app/me/_components/MyPageTabs.tsx` | 20 | — |
| `app/me/_components/MyPageStickyNav.tsx` | 20 | — |
| `app/me/settings/_pages/SettingsPage.tsx` | 80 | — |
| `app/clubs/[clubId]/member/_components/MemberPageHeader.tsx` | 28 | — |
| `app/manage/clubs/[clubId]/facility-bookings/_components/FacilityBookingsView.tsx` | 51 | — |

### D. 필터 영역 ↔ 목록 (3)

| 파일 | 라인 |
|---|---|
| `app/admin/facility-bookings/_tabs/BookingManagementTab.tsx` | 144 |
| `app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` | 213, 266 |

### E. 푸터 (5)

| 파일 | 라인 |
|---|---|
| `app/_components/HomeFooter.tsx` | 10 (모바일 푸터 상단), 16 (브랜드↔링크), 37 (데스크탑 푸터 상단), 114 (copyright) |
| `app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/page.tsx` | 310 (PII 고지) |

### F. 카드 푸터 점선 — 디자인 시그니처 (7)

| 파일 | 라인 |
|---|---|
| `app/clubs/_components/ClubCard.tsx` | 153 |
| `app/_components/sections/FeaturedClubs.tsx` | 110 |
| `app/notices/_components/NoticeMetaCard.tsx` | 36 |
| `app/me/_components/SectionSaved.tsx` | 96 |
| `app/introduce/_components/sections/BeforeAfter.tsx` | 85 |
| `app/facilities/_components/booking/DayBookingOverview.tsx` | 51, 64 |

### G. 아코디언 · 펼침 영역 (11)

| 파일 | 라인 |
|---|---|
| `components/Accordion.tsx` | 60 |
| `app/_components/sections/HomeFaqAccordion.tsx` | 63 |
| `app/faq/_pages/FaqPage.tsx` | 91 |
| `app/faq/_components/FaqFeedback.tsx` | 56 |
| `app/facilities/_components/FacilityUsageGuide.tsx` | 48 |
| `app/admin/faqs/_components/FaqCategoryManager.tsx` | 123 |
| `app/admin/faqs/_components/FaqSearchMissPanel.tsx` | 53 |
| `app/admin/facility-bookings/submission/_components/ClubRosterAccordion.tsx` | 66 |
| `app/admin/facility-bookings/submission/_components/SubmissionClubGroupList.tsx` | 79 (`<ul>` 상단선 — 행선 83 은 유지) |
| `app/admin/facility-bookings/submission/[batchId]/_pages/SubmissionBatchDetailPage.tsx` | 254 (행선 256 은 유지) |
| `app/manage/clubs/[clubId]/info/_components/ProjectsRepeater.tsx` | 75 |

### H. 카드 · 패널 내부 헤더선 / 섹션선 / 푸터선 (34)

| 파일 | 라인 | 비고 |
|---|---|---|
| `app/clubs/[clubId]/_components/ClubDetailAbout.tsx` | 77, 122 | 122 는 조건부 — 여백 `mt-5 pt-5` 는 유지 |
| `app/clubs/[clubId]/_components/ClubRecruitmentSummary.tsx` | 79 | |
| `app/calendar/_components/EventDetailModal.tsx` | 101, 109 | 모달 **본문** 섹션선 (푸터 75 는 유지) |
| `app/_components/sections/Categories.tsx` | 119 | 이미지↔라벨 구분 · 인라인 `borderColor` 도 정리 |
| `app/me/_components/SectionActivity.tsx` | 59 | |
| `app/me/settings/_pages/SettingsPage.tsx` | 54 | `SettingsCard` 헤더 — danger 배경은 유지 |
| `app/me/settings/_components/SessionListCard.tsx` | 104 | 카드 헤더 (행선 47 은 유지) |
| `app/admin/_components/AdminSidebar.tsx` | 122 | 사이드바 푸터 |
| `app/manage/_components/ManageShell.tsx` | 122 | 사이드바 푸터 (`border-white/10`) |
| `app/admin/users/_components/AdminUserDetailSheet.tsx` | 285 | 위험 작업 라벨 스트립 (시트 헤더 118 은 유지) |
| `app/admin/users/_pages/AdminUsersPage.tsx` | 181 | Pagination 상단 |
| `app/admin/inquiries/[inquiryId]/_pages/AdminInquiryDetailPage.tsx` | 333 | |
| `app/admin/promotion-requests/_pages/AdminPromotionRequestDetailPage.tsx` | 173 | `<dl>` 상세 블록 |
| `app/admin/leader-succession/_pages/AdminSuccessionDetailPage.tsx` | 111 | `<dl>` 상세 블록 |
| `app/admin/reports/_pages/AdminReportDetailPage.tsx` | 113 | `<dl>` 상세 블록 |
| `app/admin/faqs/_components/FaqCategoryManager.tsx` | 190 | 폼 액션 행 |
| `app/admin/facility-bookings/_tabs/BookingManagementTab.tsx` | 237 | Pagination 상단 |
| `app/admin/facility-bookings/_tabs/SubmissionBatchesTab.tsx` | 266 | Pagination 상단 |
| `app/admin/facility-bookings/_tabs/SubmissionPrepareTab.tsx` | 333 | `border-b-8` 시설 그룹 띠 — QA 중점 |
| `app/admin/facility-bookings/submission/[batchId]/transcribe/_pages/TranscribeCockpitPage.tsx` | 103, 155, 190 | ConsoleCard 헤더 · 하단 네비 · 우측 패널 헤더 |
| `app/manage/clubs/[clubId]/fees/_components/BankReviewQueue.tsx` | 198, 224 | 두 분기 대칭 유지 |
| `app/manage/clubs/[clubId]/members/_components/MemberTable.tsx` | 208 | 모바일 카드 푸터 |
| `app/manage/.../applicants/_components/ApplicantTable.tsx` | 207 | 모바일 카드 푸터 |
| `app/manage/.../interview/rounds/[roundId]/_components/RoundMemberTable.tsx` | 28 | 카드 헤더 |
| `app/manage/.../interview/rounds/new/_components/Step1Candidates.tsx` | 94, 204 | 그룹 헤더 · 스텝 푸터 |
| `app/manage/.../interview/rounds/new/_components/Step2RoundForm.tsx` | 187 | 스텝 푸터 |
| `app/manage/.../interview/rounds/new/_components/Step3Slots.tsx` | 99 | 스텝 푸터 |
| `app/manage/.../interview/rounds/new/_components/Step4Review.tsx` | 142 | 스텝 푸터 |

## 유지 대상 (69곳) — 손대지 않음

- **테이블** — `AdminClubsTable`, `AdminUsersTable`, `AdminSuccessionTable`, `AdminReportsTable`,
  `AdminPromotionsTable`, `AdminNoticesTable`, `AdminGlobalEventTable`, `AdminPromotionRequestsTable`,
  `AdminClubMemberHistoryTable`, `AdminBookingQueueTable`, `SubmissionBatchesTab`(165),
  `AdminInquiriesListPage`(135), `AdminFaqListPage`(213), `FaqSearchMissPanel`(74), `FeeReceiptDocument`
- **목록 행선** — `RelatedNotices`, `NoticeEventSummary`, `ClubRecruitmentCard`, `ClubExplorePage`(762·793),
  `SessionListCard`(47), `SettingsPage`(33), `TermsAgreement`, `UserMenu`, `NavDropdown`(54),
  `SubmissionClubGroupList`(83), `SubmissionBatchDetailPage`(256), `AdminMockup`, `FeesMockup`
- **모달·시트·드롭다운 chrome** — `NotificationSheet`(75·131), `AdminBookingDetailModal`(256·474 및
  313·318·322 격자), `AdminUserDetailSheet`(118), `MemberDetailPanel`(162, sheet/dialog 공용 마크업),
  `NavDropdown`(37), `ClubEventFormModal`, `ClubNoticeFormModal`, `EventDetailModal`(75),
  `ClubExplorePage`(735), `components/ui/sheet.tsx`(41)
- **고정 하단 바** — `BottomNav`(77), `ClubDetailApplyBar`(54), `NoticeDetailLinkBar`(23),
  `BulkActionBar`(32), `MemberBulkToolbar`(163), `BookingPanel`(106)
- **컨트롤 서피스** — `NoticeRichEditor`(162) 툴바
- **텍스트 장식** — `HomeHero`(101·109) `<em>ing</em>`, `introduce/Hero`(89) `두잉`, `Categories`(56) hover 밑줄
- **탭 활성 표시** — 각 탭의 `border-b-[2.5px] border-ink`
- **셀 보더** — `WeekTimetable`, `DaySlotList`

## 히어로 `DU` / `ING` 제거

`app/_components/sections/HomeHero.tsx` — "두잉" 아래 `absolute` 보조 텍스트 블록(`DU` / `ING`)과
각 글자 위 `h-px` 장식 라인 제거. 그 블록의 위치 기준이자 아래 여백만 담당하던
`<span className="relative inline-block pb-[22px]">` 래퍼를 접고, `SparkleFull` 위치 기준인
안쪽 `relative inline-block` 만 남긴다.

- 히어로 배지 `DU + ING`(55~58행)는 **별개 요소이며 유지** — `DESIGN.md` L6 의 mono 마이크로 라벨 예시가 이것을 가리킨다
- 타이틀 크기·폰트·색상·줄바꿈·Starburst 위치 불변, 아래 22px 빈 공간만 축소
- 기존 테스트에 `DU` / `ING` 단언 없음

## 테스트 영향

`apps/web/test/clubs/club-detail-about.test.tsx` 2건이 유일하게 보더 클래스를 단언한다.

- 100행 `본문·highlights 가 모두 있으면 추천 영역 앞에 구분선을 둔다`
- 106행 `본문 없이 highlights 만 있으면 구분선 없이 추천 영역만 렌더한다`

두 테스트가 실제로 지키는 건 "본문이 있을 때만 분리한다"는 **조건부 렌더 로직**이고 보더는 관찰
수단일 뿐이다. 단언 대상을 여백 클래스(`mt-5`)로 바꾸고 테스트명도 "여백을 둔다"로 맞춘다.
그 외 테스트는 보더 클래스에 의존하지 않는다.

## 검증

1. `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` (cwd: `frontend/`)
2. `:3000` 실브라우저 QA — **1440 / 768 / 390** 3해상도
   - 홈, 동아리 탐색, 동아리 상세, 공지 목록·상세, FAQ, 소개, 약관
   - 마이페이지, 설정, 동아리 운영(멤버·회비·모집), 총동연 콘솔(회원·시설예약·제출)
   - 중점: 헤더↔본문 붙음, 탭 레일 활성 표시 1px 어긋남, `border-b-8` 시설 그룹 띠,
     `TranscribeCockpit` 3분할 밀도, 카드 푸터 여백
3. QA 에서 붙어 보이는 곳만 여백 보정
4. 최종 grep 으로 제거 대상 잔여 0 확인 (유지 목록 제외)

## Out of Scope

- `<hr>` · `Divider` / `Separator` 컴포넌트 신설 또는 제거 — 해당 없음(0건)
- 배경색 · 그림자 · radius · 레이아웃 구조 변경
- `border-line` 토큰 값 변경 — 외곽선·테이블이 같은 토큰을 쓰므로 건드리지 않는다
- 세로 구분선(`border-l` / `border-r`) — 요청 범위 밖
- `BottomNav` 상단 헤어라인 및 `DESIGN.md` L409
- 백엔드 · 모바일(RN) 앱

## 롤백

시각 변경만 있고 데이터·API 영향이 없다. 문제 시 PR revert 로 원복한다.
