# 동아리 스칼라 메타데이터 + 모집 면접/지원자 노출 필드 확장

작성일: 2026-05-19

## 1. 배경 / 목표

PR3 (#93) 에서 학생측 동아리 상세 페이지 디자인을 포팅하면서, API 가 제공하지 않는 필드 13개를
조건부 렌더링으로 모두 숨겨 두었다. 본 spec 은 그 중 **스칼라 메타데이터 8개** 를 모델·응답·관리자 폼·학생 표시까지
한 흐름으로 확장한다. 서술형 콘텐츠(태그라인 · "이런 사람이 좋아할 거예요" 리스트 · "주요 프로젝트" 텍스트) 와
"모집 목표 인원" 은 본 spec 범위 외 (전자는 다음 spec, 후자는 capacity 로 갈음).

추가로 디자인 원본의 **Underline Tabs**(소개 / 활동 / Q&A / 동아리 상세정보) 도 이번 spec 에서 동적 API 연결로 복원한다.

## 2. 범위에 포함되는 필드 (8개)

### Club 엔티티 (6개, 모두 nullable)

| 필드 | 타입 | 검증 |
|---|---|---|
| `foundedYear` | `Integer` | `1900 ≤ year ≤ 현재년` |
| `cohortNumber` | `Integer` | `≥ 1` |
| `location` | `String(200)` | — |
| `contactEmail` | `String(200)` | `@Email`, 빈 값/null 허용 |
| `activityFrequency` | `Integer` | `≥ 1` (의미: 주 N회) |
| `activeDays` | DB: `String(50)` CSV → 엔티티: `Set<DayOfWeek>` | 각 값이 `DayOfWeek` enum 에 속함 |
| `membershipFee` | `String(100)` | — (프리폼: 예 `"학기당 30,000원"`) |

> 7행이지만 `activityFrequency` + `activeDays` 는 운영상 "활동 빈도" 한 가지 개념이라 헤더 카운트는 6.

### Recruitment 엔티티 (3개)

| 필드 | 타입 | 기본값 / 검증 |
|---|---|---|
| `interviewStartDate` | `LocalDate` (nullable) | `useInterview=true` 일 때 의미. null 허용 |
| `interviewEndDate` | `LocalDate` (nullable) | 둘 다 있을 때 `start ≤ end` |
| `showApplicantCount` | `boolean` | NOT NULL, default `false` |

## 3. 범위에서 제외된 항목

- **서술형 콘텐츠 3개** (태그라인, 강조 리스트, 주요 프로젝트 텍스트) — 다음 spec 에서 다룬다.
- **`targetApplicantCount`** — capacity 와 별개의 "지원자 목표". YAGNI 로 제거. 진행률 비교가 필요해지면 그때 추가.
- **회원수 셀** (`ClubDetailStats` 에서 표시) — `clubMember` count 가 이미 다른 경로로 가능하지만 본 spec 에서는 다루지 않음. UI 자리는 비워 두고 후속 작업에서 채운다.

## 4. DB 마이그레이션

**`V21__alter_club_add_metadata.sql`**

```sql
ALTER TABLE club
    ADD COLUMN founded_year INTEGER,
    ADD COLUMN cohort_number INTEGER,
    ADD COLUMN location VARCHAR(200),
    ADD COLUMN contact_email VARCHAR(200),
    ADD COLUMN activity_frequency INTEGER,
    ADD COLUMN active_days VARCHAR(50),
    ADD COLUMN membership_fee VARCHAR(100);
```

**`V22__alter_recruitment_add_interview_metadata.sql`**

```sql
ALTER TABLE recruitment
    ADD COLUMN interview_start_date DATE,
    ADD COLUMN interview_end_date DATE,
    ADD COLUMN show_applicant_count BOOLEAN NOT NULL DEFAULT FALSE;
```

> 둘 다 기존 데이터에 영향 없음. `active_days` 는 `Club.tags` 와 같은 CSV 컬럼 패턴 사용.

## 5. 백엔드 변경

### Club 도메인

- **`Club.java`** — 7개 필드 추가 + `update()` 메서드 확장. `activeDays` 는 엔티티 내부에서 CSV ↔ `Set<DayOfWeek>` 변환 헬퍼 (예: `getActiveDays(): Set<DayOfWeek>`, `setActiveDays(Set<DayOfWeek>)`). DB 컬럼은 `String` 매핑.
- **DTO**
  - `UpdateClubPayload` (record): 7개 필드 optional 추가
  - `ClubDetail` 응답 record: 7개 필드 nullable 노출. `activeDays` 는 JSON 배열 (`["MON","WED","FRI"]`)
  - `ClubSummary` 변경 없음 (탐색 카드에는 노출 안 함)
- **검증** — Bean Validation
  - `foundedYear`: `@Min(1900) @Max(현재년)` (현재년 동적, custom validator 또는 service 검증)
  - `contactEmail`: `@Email`
  - `activityFrequency`: `@Min(1)`
  - `activeDays`: 각 값이 `DayOfWeek` enum 에 속하는지 변환 시점에 검증
- **테스트** — 7개 필드 round-trip, 검증 실패 케이스 (잘못된 year/email/day)

### Recruitment 도메인

- **`Recruitment.java`** — 3개 필드 추가. `update()` 에서 면접일 검증: `interviewStartDate != null && interviewEndDate != null` 일 때 `start ≤ end`.
- **DTO**
  - `CreateRecruitmentRequest`, `UpdateRecruitmentRequest`: 3개 필드 optional 추가
  - `RecruitmentSummary` 응답: 변경 없음 (목록 / 카드에는 노출 안 함)
  - `RecruitmentDetail` 응답: 3개 필드 + 조건부 `applicantCount`
    - `showApplicantCount == true` → `applicantCount: Integer` (count 쿼리 1번)
    - `showApplicantCount == false` → `applicantCount: null` (쿼리 생략)
- **신규 쿼리** — `ApplicationRepository.countByRecruitmentId(Long)` 존재 확인. 없으면 추가.
- **검증** — 면접일 페어 (start>end → `InvalidInterviewPeriodException` 신규)
- **테스트** — 면접일 검증, `showApplicantCount` on/off 시 응답 형태

## 6. 프론트엔드 변경

### 타입 / 스키마

**`packages/types/src/club.ts`** — `ClubDetail`, `UpdateClubPayload` 에 7개 필드 추가. `activeDays`는 `('MON'|'TUE'|'WED'|'THU'|'FRI'|'SAT'|'SUN')[]`.

**`packages/types/src/recruitment.ts`** — `RecruitmentDetail` 에 3개 필드 + `applicantCount?: number | null`. `CreateRecruitmentPayload`, `UpdateRecruitmentPayload` 에 3개 optional 필드.

**`packages/schemas/src/index.ts`**
- `updateClubSchema`: 7개 필드 optional + 형식 검증 (year range, email, day enum, frequency ≥ 1)
- `createRecruitmentSchema`, `updateRecruitmentSchema`: 3개 필드 optional + `interviewStartDate ≤ interviewEndDate` refine

### 관리자 화면

**`manage/clubs/[clubId]/info/_components/ClubInfoForm.tsx`**
- 신규 입력 7개 (input 6개 + 요일 체크박스 그룹 1개)
- 카테고리/태그/SNS/FAQ 와 동일한 단순 폼 패턴
- 새 요일 체크박스 컴포넌트: 7개 요일 토글 (MON~SUN). 라벨은 한 글자(월/화/...)

**`manage/clubs/[clubId]/recruitments/_components/RecruitmentForm.tsx`**
- 면접 일정 2개 date input — `useInterview=true` 일 때만 표시
- "지원자 수 공개" 체크박스
- 폼 검증: 면접 시작 ≤ 끝

### 학생측 동아리 상세 — Underline Tabs 복원 + 조건부 렌더링 활성화

**신규 컴포넌트 `ClubDetailTabs.tsx`**
- 4개 탭: `intro` / `activity` / `qna` / `info`
- 클라이언트 `useState` 로 활성 탭 관리 (URL 동기화 없음)
- 빈 탭은 탭바에서 자체 제거 (3개 이하로 줄어들 수 있음)
- 라벨: 소개 / 활동 / Q&A / 동아리 상세정보
- 활성 탭 표시: 하단 2.5px ink 색 border (디자인 원본과 동일)

**탭별 콘텐츠 매핑**

| 탭 | 콘텐츠 | 비어 있는 조건 (탭 제거) |
|---|---|---|
| 소개 | `ClubDetailAbout` (`club.description` 본문) | `description == null` |
| 활동 | 활동 라인 (`주 N회 (요일·요일)` 포맷) + `ClubDetailPhotos` | `activityFrequency == null && activeDays.length == 0 && photos.length == 0` |
| Q&A | `club.faqs` 리스트 (기존 FAQ 섹션 코드 이전) | `faqs.length == 0` |
| 동아리 상세정보 | 창설년도 · 기수 · 회비 · 위치 · 컨택 이메일 의 key-value 리스트 (`<dl>`) | 5개 모두 null 일 때 |

> "이런 사람이…" / "주요 프로젝트" 는 다음 spec 의 서술형 콘텐츠 PR 에서 **소개 탭**에 추가.

**`ClubDetailHero.tsx`** — 카테고리 칩 옆 메타 라인 활성화:
```
2018년 창설 · 10기
```
`foundedYear` 또는 `cohortNumber` 둘 중 하나라도 있으면 노출, 둘 다 null 이면 라인 자체 숨김.

**(신규) `ClubDetailStats.tsx`** — Hero 아래, 탭 위. 4열 stats row:

| 셀 | 데이터 |
|---|---|
| 회원 | (본 spec 범위 외 — 셀 자체 숨김) |
| 활동 | `주 {activityFrequency}회 ({activeDays.join('·')})` — 둘 다 있어야 셀 노출 |
| 부원 평균 학년 | (본 spec 범위 외) |
| 창설년도 | `foundedYear` |

데이터 있는 셀만 렌더링. 모두 비면 stats row 자체 숨김.

**`ClubRecruitmentCard.tsx`** — 행 추가 (조건부):
- 면접 일정: `interviewStartDate != null && interviewEndDate != null` 이면 `M.D - M.D` 형식으로 노출 (예: `9.28 - 9.29`)
- 지원자 수: `applicantCount != null` (백엔드가 노출 결정) 이면 `"현재 지원자 N명"` 텍스트

**`ClubContactCard.tsx`** — 행 추가:
- 위치: `📍 {location}`
- 이메일: `📨 {contactEmail}` (mailto: 링크)

### 테스트
- Vitest 단위 테스트
  - ClubInfoForm: 7개 필드 입력 — 요일 토글 동작, year/email/frequency 검증 에러
  - RecruitmentForm: useInterview 체크 시 면접일 input 노출, start>end 에러, showApplicantCount 토글
  - ClubDetailTabs: 빈 탭 숨김, 활성 탭 전환
  - ClubDetailStats: 데이터 유무에 따른 셀 노출

## 7. 구현 순서 / PR 분할

- **PR A (백엔드)** — Flyway V21·V22 + Club/Recruitment 엔티티/DTO/검증 + applicantCount 쿼리 + 백엔드 테스트
- **PR B (프론트 타입 + 관리자 폼)** — packages 타입/스키마 + ClubInfoForm 7개 필드 + RecruitmentForm 면접 일정/지원자 공개 토글 + 폼 단위 테스트
- **PR C (학생측 표시 + 탭 복원)** — ClubDetailHero 메타 라인, ClubDetailStats 신규, ClubDetailTabs 신규(4탭 + 빈탭 숨김), Recruitment/Contact 카드 행 추가, 학생측 표시 테스트

각 PR 은 `develop` 분기 → `develop` PR. 백엔드 → 타입/폼 → 표시 순서로 의존.

## 8. 리스크 / 체크 포인트

- **`activeDays` CSV 컬럼** — `Club.tags` 와 같은 패턴. 본 spec 에서는 단순 노출만 다루며 요일별 동아리 탐색 필터는 다루지 않는다.
- **`applicantCount` 쿼리 비용** — 모집 상세 1건 요청당 count 1회 추가. 충분히 가벼움. 캐싱은 React Query 가 처리.
- **면접 일정 ↔ 모집 기간 관계** — 면접일이 모집 종료일 이전인 경우(모집 중 면접)도 허용. 강제 차단 없음.
- **`showApplicantCount` 기본값 false** — 기존 모집은 자동 비공개. 운영진이 의도적으로 켜야 노출.
- **이메일 형식 검증** — 백엔드 `@Email`, 프론트 Zod `.email()`. 빈 값/null 은 허용.
- **탭 컨테이너 영향** — 기존 `page.tsx` 의 왼쪽 컬럼은 본문/사진/FAQ 가 위에서 아래로 흐르는데, 탭 복원 시 본문은 탭 안으로 들어간다. 본문이 탭 컨테이너 안에서 같은 max-width(700px) 유지하는지 확인.
- **탭 라벨 한국어** — 디자인 토큰(font-body, charcoal-3, ink) 일치. 활성 시 하단 border 2.5px ink, 비활성 charcoal-3 / hover charcoal.
