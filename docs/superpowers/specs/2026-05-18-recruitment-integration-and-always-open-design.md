# 모집 통합 · 상시모집 · 동아리 상세 페이지 디자인 포팅

작성일: 2026-05-18

## 1. 배경 / 목표

현재 동아리 한 곳에는 동시에 진행 중인 모집이 1개만 존재한다는 운영 가정에도 불구하고,
학생용 흐름이 "동아리 상세 → 진행 중인 모집 목록 → 모집 상세 → 지원" 으로 두 단계가 더 있다.
또한 모집 상태가 `OPEN` / `CLOSED` 두 가지뿐이라 "상시모집" 형태를 지원할 수 없다.

이번 작업에서 다루는 세 가지:

1. **학생측 모집 통합** — 동아리 상세 페이지에 진행 중 모집 정보 + 지원하기 버튼을 직접 통합하고 별도 모집 상세 라우트를 제거한다.
2. **상시모집 지원** — 종료일이 없는 모집을 표현할 수 있도록 한다.
3. **동아리 상세 페이지 디자인 포팅** — `handoff/reference_jsx/a-detail.jsx`(ADetail) 를 TypeScript + Tailwind 로 옮긴다.

## 2. 학생측 모집 통합

### 흐름 변경
- before: `/clubs/[clubId]` → "진행 중인 모집" 카드 리스트 → `/clubs/[clubId]/recruitments/[recruitmentId]` → "지원하기"
- after: `/clubs/[clubId]` 안의 우측 sticky "모집 카드" 에서 곧바로 "지원하기"

### 동작
- 활성 모집(`effectivelyOpen === true`)이 있으면 sticky 카드에 정보 표시 + 활성화된 "지원하기"
- 활성 모집이 없으면 안내 문구("현재 진행 중인 모집이 없습니다") + 비활성 "지원하기" 버튼
- 외부 폼이면 "외부 폼으로 이동" 라벨로 변경
- 운영진 모집(`targetRole === 'OFFICER'`) 경고 배너는 기존 모집 상세 페이지 로직을 옮긴다

### 라우트 제거
- `frontend/apps/web/app/clubs/[clubId]/recruitments/[recruitmentId]/page.tsx` 삭제
- 잔존 링크 사용처는 grep 후 `/clubs/[clubId]` 로 일괄 교체. 외부 알림/딥링크용으로 남겨야 할 필요가 있는지 확인 — 없으면 완전 삭제

## 3. 상시모집

### 백엔드 모델 변경

1. **Flyway 신규 마이그레이션** — `end_date NOT NULL` 제약 제거
2. **`Recruitment` 엔티티**
   - `endDate` nullable
   - 생성 검증: `endDate == null` 이면 상시모집, 그렇지 않으면 `endDate >= startDate` 검증
   - `isEffectivelyOpen(today)` = `status == OPEN && (endDate == null || !today.isAfter(endDate))`
3. **수정 정책** — 생성 시점에 상시모집/기간모집 결정. 수정에서는 종료일 조정만 허용하며 상시 ↔ 기간 전환은 불가(에러 응답)
4. **알림 잡** — `DeadlineNotificationJob` 은 `endDate == null` 모집을 대상에서 제외

### 표시 상태 (displayStatus)

백엔드 응답에 `displayStatus` 필드 추가:

| 상태 | 조건 | 한국어 라벨 |
|---|---|---|
| `UPCOMING` | `status == OPEN && today < startDate` | 모집예정 |
| `OPEN` | `status == OPEN && startDate <= today <= endDate` | 모집중 |
| `ALWAYS_OPEN` | `status == OPEN && endDate == null` | 상시모집 |
| `CLOSED` | `status == CLOSED || today > endDate` | 모집마감 |

`effectivelyOpen` 은 `displayStatus in (OPEN, ALWAYS_OPEN)` 로 유지(하위 호환).

### DTO
- `CreateRecruitmentRequest.endDate` → optional (`null` 허용)
- `RecruitmentSummary` / `RecruitmentDetail` 응답
  - `endDate: LocalDate | null`
  - `displayStatus: UPCOMING | OPEN | ALWAYS_OPEN | CLOSED` 추가
- 기존 `effectivelyOpen: boolean` 유지(전환 비용 절감)

### 영향 위치
- `RecruitmentRepositoryImpl`, `ClubRepositoryImpl` 등에서 `is_recruiting` 또는 마감일 정렬을 사용하는 쿼리에 상시모집 반영(`end_date IS NULL` → NULLS LAST, 모집중 취급)
- 마감 임박 정렬은 상시모집을 가장 뒤로

### 프론트
- 타입 (`packages/types/src/recruitment.ts`):
  - `endDate: string | null`
  - `displayStatus: 'UPCOMING' | 'OPEN' | 'ALWAYS_OPEN' | 'CLOSED'`
- 관리자 모집 작성 폼(`recruitments/_components/RecruitmentForm.tsx`)
  - "상시모집" 체크박스 추가
  - 체크 시 endDate 입력 `disabled` + 제출 페이로드에서 `endDate: null`
- 관리자 모집 목록/상세, 학생 동아리 카드, 학생 동아리 상세 등 표시 자리에서
  `effectivelyOpen ? '모집 중' : '마감'` 분기를 `displayStatus` 매핑 라벨로 교체

### 테스트
- 백엔드: 상시모집 생성/수정/마감/지원, 알림 잡 제외, `displayStatus` 도출 (모든 케이스)
- 프론트: Vitest — `displayStatus → 라벨` 매핑, 체크박스 ↔ endDate disabled 토글

## 4. 동아리 상세 페이지 디자인 포팅

### 대상
- 원본: `handoff/reference_jsx/a-detail.jsx` (`ADetail`)
- 결과: `frontend/apps/web/app/clubs/[clubId]/page.tsx` 와 그 하위 `_components/` (필요한 만큼 추출)

### Tailwind 토큰
이미 `apps/web/tailwind.config.ts` 에 동일 토큰(ink/sage/charcoal/line/cream/paper/shadow/maxWidth=layout 등) 정의됨.
인라인 `style={{}}` 은 MIGRATION_MAP.md 매핑대로 클래스로 옮긴다.

### 컴포넌트 분리(`apps/web/app/clubs/[clubId]/_components/`)
- `ClubDetailHero.tsx` — 좌측 identity 블록(로고/카테고리 칩/displayStatus 칩/이름/설명) + Stats row(조건부)
- `ClubDetailTabs.tsx` — 소개/활동/Q&A/상세정보 탭 (로컬 상태). 활동/Q&A/상세정보 콘텐츠가 비면 비활성 처리
- `ClubDetailAbout.tsx` — description 본문
- `ClubDetailPhotos.tsx` — 4열 사진 그리드, 8장 초과 시 마지막에 `+N` 오버레이
- `ClubRecruitmentCard.tsx` — sticky 우측 카드. **학생측 모집 통합의 핵심 위치**
- `ClubContactCard.tsx` — sage-mist 톤 미니 카드(SNS 링크만)

> `ANav` 는 이미 `apps/web` 의 네비게이션을 쓰는 곳이 있으면 그쪽을 사용. 없다면 `handoff/components/ANav.tsx` 를 `app/_components/` 로 옮겨 채택 — 별도 작업이라 본 디자인 포팅 PR 에서는 기존 레이아웃 유지.

### 데이터 매핑 / 누락 필드 처리

**전략:** 디자인은 그대로 포팅하되, API 가 제공하지 않는 필드는 **조건부 렌더링(데이터 있을 때만)** 한다.
모두 비어 있는 섹션/행은 자체 숨김. API 확장은 후속 작업.

| 디자인 위치 | 매핑 | 누락 시 처리 |
|---|---|---|
| Breadcrumb 카테고리 | `club.category` → 한국어 라벨 (기존 `ACADEMIC → 학술` 매핑 활용) | division 도 함께 표시 가능 |
| Hero 로고(140×140 그라데이션 프레임) | `club.logoUrl` 이미지 | 없으면 동아리 이름 첫 글자 폴백(`font-display` 큰 글자) |
| 카테고리 칩 | `club.category` 라벨 | — |
| displayStatus 칩 | 모집 displayStatus 라벨 | 활성 모집 없으면 칩 미표시 |
| "2018년 창설 · 10기" | 창설년도 / 기수 | **전체 행 숨김** (필드 없음) |
| h1 이름 | `club.name` | — |
| 본문 한 줄 소개 | `club.description` 의 첫 줄 또는 전체 | 없으면 숨김 |
| Stats row (회원/활동/평균/창설년) | 없음 | **섹션 전체 숨김** |
| 탭(소개/활동/Q&A/상세정보) | 소개=description, Q&A=`club.faqs`, 상세정보=일반 메타. 활동은 없음 | 컨텐츠 없는 탭 비활성 |
| About h2 "코드를 두잉" | 동아리별 카피 (없음) | 표시하지 않고 description 만 |
| "이런 사람이 좋아할 거예요" 불릿 | 없음 | **블록 전체 숨김** |
| "2025년 주요 프로젝트" | 없음 | **블록 전체 숨김** |
| 사진 그리드 | `club.photos` (`useClubPhotosQuery` 또는 detail.photos) | 0장이면 섹션 숨김 |
| 모집 카드 D-day | endDate 기준 계산. 상시모집이면 "상시모집"으로 대체 | — |
| 모집 카드 "기수" | 없음 | 헤더 라인을 displayStatus 라벨로 대체 |
| 모집 인원 | `recruitment.capacity` + `useInterview` ("XX명 (서류 + 면접)" / "XX명 (서류)") | — |
| 모집 기간 | `startDate ~ endDate`. 상시모집이면 "상시모집" | — |
| 면접 일정 | 없음 | **행 숨김** |
| 대상 | `targetRole` ("부원 모집" / "운영진 모집") | — |
| 회비 | 없음 | **행 숨김** |
| 진행률 progress bar | 없음 (지원자 수 미공개) | **블록 숨김** |
| 지원하기 버튼 | 활성 모집 있으면 활성, 외부 폼이면 라벨 "외부 폼으로 이동" | 없으면 비활성 + 안내 |
| 찜하기 + 카운트 | 기존 `FavoriteToggleButton` 그대로. 카운트는 미표시 | — |
| Contact 카드 위치/이메일 | 없음 | **행 숨김** |
| Contact 카드 인스타 등 | `club.snsLinks` | 없으면 카드 전체 숨김 |

### 누락 필드 후속 작업(이번 PR 범위 외)
다음 필드는 추후 별도 spec/PR 에서 백엔드/관리자 폼/응답까지 확장.
- Club: 창설년도, 기수, 위치, 컨택 이메일, 활동 빈도/요일, 회비, 한 줄 태그라인, 강조 항목 리스트
- Recruitment: 면접 일정, 모집 목표 인원(capacity 와 별개), 지원자 누적 수 노출 여부

### 모집 상태별 카드 카피

| displayStatus | 카드 헤더 | 본문 강조 라인 | 지원 버튼 |
|---|---|---|---|
| OPEN | `모집중 · D-{n}` | "지금 바로 지원할 수 있어요" | 활성 |
| ALWAYS_OPEN | `상시모집` | "언제든 지원할 수 있어요" | 활성 |
| UPCOMING | `모집예정 · MM.DD부터` | "곧 모집이 시작돼요" | 비활성 |
| CLOSED | `모집마감` | "이번 모집은 종료됐어요" | 비활성 |
| (모집 없음) | `모집 없음` | "현재 진행 중인 모집이 없습니다" | 비활성 |

## 5. 구현 순서 / PR 분할

- **PR 1 (백엔드)** — 상시모집 모델/응답 + `displayStatus` + 알림 잡 / 정렬 보정 + 테스트
- **PR 2 (프론트 · 상시모집 표시)** — 타입/관리자 폼/관리자 목록·상세에 `displayStatus` 적용 + 체크박스
- **PR 3 (프론트 · 학생측 상세 디자인 포팅)** — 새 `ClubDetailHero/Tabs/About/Photos/RecruitmentCard/ContactCard` 컴포넌트 + 통합 + 기존 `/clubs/[clubId]/recruitments/[recruitmentId]` 라우트 제거 + 잔존 링크 교체

> PR 1 머지 → PR 2 분기, PR 2 머지 → PR 3 분기. CLAUDE.md 의 "1 페이지/기능 = 1 PR" 원칙 준수.

## 6. 리스크 / 체크 포인트

- 학생측 라우트 삭제 시 다른 곳(알림/즐겨찾기/지원이력)의 직접 링크 잔존 — grep 필수, redirect 또는 링크 교체
- 상시모집의 `is_recruiting` / 마감일 정렬 영향 — 관련 쿼리(`RecruitmentRepositoryImpl`, `ClubRepositoryImpl`, `ClubFavoriteRepositoryImpl`) 모두 점검
- `displayStatus` 도입 후 `effectivelyOpen` 사용처는 그대로 둠(중복 같지만 의미가 명확). 추후 통일은 별도 작업
- 상시모집을 `endDate = null` 로 두면 정렬에서 NULL 위치(DB 기본 동작)에 의존하므로 명시적 `NULLS LAST` 적용
- Tailwind 토큰은 정의되어 있으나 글꼴 `GmarketSans` 가 실제로 로드되는지 확인. 미로딩 시 fallback Pretendard 로 자연스러운 폴백
