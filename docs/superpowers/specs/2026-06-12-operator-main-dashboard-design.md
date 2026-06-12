# 운영자 메인 대시보드 — 설계 문서 (v1)

- 작성일: 2026-06-12
- 대상: Du-ing 프론트엔드 (`frontend/apps/web`, Next.js 15 / React 19 / TanStack Query)
- 범위: 동아리 운영자(`OFFICER`/`LEADER`)가 로그인 후 처음 만나는 메인 랜딩 대시보드
- 버전 전략: **v1 = 프론트엔드 전용(기존 API 조합)**, v2 = 백엔드 집계 API 도입(별도 spec)

---

## 1. 배경 / 목표

운영자가 `/manage` 진입 시 현재는 첫 관리 동아리 상세로 **자동 리다이렉트**된다(`apps/web/app/manage/page.tsx`). 이 진입점을 운영자가 "지금 무엇을 해야 하는지"를 한눈에 파악하는 **메인 대시보드**로 교체한다.

대시보드는 5개 영역으로 구성한다.

1. **처리 필요 업무** — 운영자가 액션해야 하는 항목 피드
2. **진행 중 모집** — 종료되지 않은 모집 현황
3. **지원자 현황** — 단계별 지원자 수치
4. **오늘 일정** — 오늘의 면접 슬롯 + 클럽 이벤트
5. **공지 · 일정** — 기존 동아리 공개 페이지로 가는 딥링크 카드

### 성공 기준

- 운영자가 대시보드 한 화면에서 "처리할 업무 / 모집 상태 / 지원자 / 오늘 일정"을 확인하고, 각 항목에서 상세 관리 화면으로 1클릭 이동할 수 있다.
- 신규 백엔드 작업 없이 기존 엔드포인트 조합만으로 동작한다(v1).
- 모든 카드는 로딩·빈 상태(Empty State)를 명확히 표시한다.

---

## 2. 확정된 결정 사항

| 주제 | 결정 |
|---|---|
| 대시보드 범위 | **단일 선택 동아리** 기준 (관리 동아리 중 1개 선택, 기본 = 첫 번째) |
| 카드5 정체 | 기존 공개 동아리 페이지(`/clubs/[clubId]`)로 **딥링크만**, 카드 명칭은 **"공지 · 일정"** |
| 백엔드 전략 | **단계적** — v1은 FE 조합, v2에서 집계 API로 교체 |
| 카드1 업무 종류 | 검토 대기 지원자 / 미확정 면접 라운드 / 응답 미수집·기간 경과 / 마감 임박 모집 / 결과 미발표 면접 라운드 (5종) |
| 카드1 표시 | **총 건수 + 상위 3개 업무 미리보기** |
| 진행 중 모집 정의 | `displayStatus`가 **`CLOSED`가 아닌 모든 모집** (UPCOMING/OPEN/ALWAYS_OPEN) |
| Empty State | **모든 카드 제공** |
| 오늘 일정 정렬 | 시간 오름차순, **동일 시간은 면접 우선** |
| Query 정책 | 대시보드 쿼리 기본 `staleTime` 60초 / `gcTime` 5분 |

---

## 3. 사용자 / 권한 컨텍스트

- 운영자 역할은 **글로벌이 아니라 동아리별**이다: `club_member.role ∈ {MEMBER, OFFICER, LEADER}`, 관리 권한 = `OFFICER | LEADER`.
- 관리 동아리 목록: `GET /api/v1/leader/clubs/me/managed` → `ManagedClub[]`
  - FE 훅: `useManagedClubsQuery()` (`packages/hooks/src/clubs.ts`), 키 `clubQueryKeys.managed()`
  - `ManagedClub`: `clubId`, `clubName`, `myRole`, `activeRecruitmentCount` 등 (`packages/types/src/club.ts:131`)
- 대시보드는 **선택된 1개 동아리** 기준으로 모든 카드를 렌더한다.
- 카드 노출 권한은 **OFFICER · LEADER 동일**(딥링크/읽기 중심이라 역할 분기 없음).

---

## 4. 라우트 & 셸

- **`apps/web/app/manage/page.tsx`** 의 자동 리다이렉트 로직을 제거하고 운영자 메인 대시보드를 렌더한다. URL은 `/manage` 유지.
- 선택 동아리는 **`?clubId=` 쿼리 파라미터**로 관리한다. 미지정 시 관리 동아리 첫 번째를 기본값으로 사용한다.
- 가드:
  - 관리 동아리 0개 → 기존 "관리하는 동아리가 없습니다" 안내 유지(현 `page.tsx` 패턴 재사용).
  - `?clubId=`가 관리 동아리 목록에 없으면 첫 번째로 폴백.
- 대시보드 상단에 **동아리 전환 컨트롤**(관리 동아리 목록 기반 select)을 두어 `?clubId=`를 갱신한다. 이 컨트롤은 `/manage`에 머문다.
  - 기존 사이드바 `ClubSelector`(`manage/_components/ClubSelector.tsx`)는 `/manage/clubs/[clubId]` 상세로 이동하는 현행 동작을 유지한다(대시보드 전용 전환 컨트롤과 별개).
- 셸/네비게이션은 기존 `ManageShell` 패턴을 따른다. 셸 통합의 구체적 형태(사이드바 공유 여부)는 구현 단계에서 결정한다(설계 제약 아님).

---

## 5. 레이아웃

- 페이지 래퍼: `<div className="duing min-h-screen bg-cream">`
- **처리 필요 업무**를 상단 와이드 영역에 배치(운영자가 가장 먼저 봐야 할 액션 피드).
- 그 아래 **진행 중 모집 · 지원자 현황 · 오늘 일정 · 공지·일정**을 반응형 2열 카드 그리드로 배치(`grid gap-4 md:grid-cols-2`).
- 카드 베이스: `.card`(`rounded-lg border border-line bg-paper p-4 transition hover:shadow-2`), 상태 표시는 `.pill`, 그림자는 `shadow-1/2/3`만 사용.
- 스켈레톤 컴포넌트는 코드베이스에 없으므로, 로딩은 기존 패턴(간단 텍스트/펄스)으로 카드별 처리한다.

---

## 6. 카드별 상세 명세

> 모든 카드는 (1) 로딩, (2) 정상, (3) Empty State 3가지 상태를 가진다. Empty State는 `bg-graysoft text-charcoal-3` 톤의 안내 문구로 카드 내부에 표시한다(섹션 전체를 숨기지 않는다).

### 카드 1 — 처리 필요 업무

운영자가 액션해야 하는 항목을 **선택 동아리 범위**에서 FE로 조합해 피드로 보여준다.

**업무 종류(5종)와 판별 기준**

| 타입 | 판별 | 데이터 출처(FE 조합) |
|---|---|---|
| `APPLICANTS_AWAITING_REVIEW` | `SUBMITTED` / `UNDER_REVIEW` 상태 지원자 존재 | 모집별 `GET /api/v1/leader/recruitments/{recruitmentId}/applications?status=...` |
| `INTERVIEW_ROUND_UNCONFIRMED` | 면접 라운드가 `ASSIGNING`(일정 미확정) | 모집별 `GET /api/v1/leader/recruitments/{recruitmentId}/interview-rounds` |
| `INTERVIEW_RESPONSE_UNCOLLECTED` | 응답 미수집 / 수집 기간 경과 라운드 | 위 라운드 목록의 상태·마감 필드 |
| `INTERVIEW_RESULT_UNANNOUNCED` | 면접 종료 후 결과 미발표 라운드 | 위 라운드 목록의 상태 필드 |
| `RECRUITMENT_CLOSING_SOON` | `endDate` 또는 `interviewEndDate`가 **D-3 이내** | 모집 요약/상세의 날짜 필드 |

> 구현 시 면접 라운드 상태 enum(`ASSIGNING`/`SCHEDULED`/결과 발표 등)과 응답·결과 관련 필드의 정확한 명칭은 백엔드 `interview-round` 응답 스키마로 확정한다.

**표시**

- 카드 헤더에 **총 업무 건수** 배지.
- 본문에 **상위 3개 업무 미리보기** 리스트. 각 항목: 타입 라벨 + 컨텍스트(모집명/라운드명/건수/`D-N`) + 우측 화살표.
- 3개 초과 시 "전체 N건" 형태로 더 있음을 표시.
- 각 항목 클릭 → 해당 모집의 지원자 관리 / 면접 라운드 관리 화면으로 딥링크(`/manage/clubs/[clubId]/...`).

**상위 3개 정렬 규칙** — 기한 임박 순 우선, 동률 시 타입 우선순위:

1. 마감/기한(`D-N`)이 있는 항목은 **임박일 오름차순**(작을수록 위)
2. 동률 또는 기한 없음 → 타입 우선순위:
   `INTERVIEW_ROUND_UNCONFIRMED` > `INTERVIEW_RESPONSE_UNCOLLECTED` > `RECRUITMENT_CLOSING_SOON` > `INTERVIEW_RESULT_UNANNOUNCED` > `APPLICANTS_AWAITING_REVIEW`

(정렬 가중치는 추후 조정 가능한 상수로 둔다.)

**Empty State**: "처리할 업무가 없어요" (모든 업무 0건).

**비용 주의**: v1에서는 모집·라운드 전반을 FE에서 fan-out하므로 동아리당 N콜이 발생한다. v2에서 `GET /api/v1/leader/clubs/{clubId}/action-items` 단일 엔드포인트로 교체한다.

---

### 카드 2 — 진행 중 모집

**정의**: `displayStatus`가 `CLOSED`가 **아닌** 모든 모집(= `UPCOMING` / `OPEN` / `ALWAYS_OPEN`).

**데이터**: `GET /api/v1/clubs/{clubId}/recruitments` → `RecruitmentSummaryResponse[]`(OPEN 우선 정렬) → FE에서 `displayStatus !== 'CLOSED'` 필터.

**표시**: 각 모집을 상태 pill(`STATUS_STYLES` 맵: OPEN/UPCOMING/ALWAYS_OPEN) + 모집명 + 기간 + 지원자 수로 표시. 지원자 수는 모집 요약 응답에 포함된 값을 우선 사용하고, 없으면 v1에서는 생략하거나 stats 합산을 재사용한다.

**클릭**: 모집 상세/관리 화면으로 딥링크.

**Empty State**: "진행 중인 모집이 없어요".

---

### 카드 3 — 지원자 현황

**데이터**: 진행 중 모집 각각의 `GET /api/v1/leader/recruitments/{recruitmentId}/stats/summary`(단계별 수치: 접수/검토/면접대기/합격/불합격 + 정원·경쟁률)를 FE에서 **합산**.

**표시**: `SummaryCards` 스타일의 stat 숫자(단계별). 진행 중 모집이 여러 개면 전체 합산값을 표시한다.

**클릭**: 통계 페이지(`/manage/clubs/[clubId]/recruitments/[recruitmentId]/stats`)로 딥링크. 모집이 여러 개면 모집 목록 또는 대표 모집으로 연결(구현 시 확정).

**Empty State**: "집계할 지원자 데이터가 없어요" (진행 중 모집이 없거나 지원자 0).

---

### 카드 4 — 오늘 일정

**데이터**: 두 출처를 합친다.

1. 오늘 `SCHEDULED` 상태 **면접 슬롯**: 진행 중 모집의 면접 라운드 → 슬롯(`InterviewSlot.startTime/endTime`)에서 오늘 날짜만 필터(`GET /api/v1/leader/interview-rounds/{roundId}` 등 라운드 상세).
2. 오늘 **클럽 이벤트**: `GET /api/v1/clubs/{clubId}/events?from={today}&to={today}` → `ClubEventCardResponse[]`.

**정렬**: 시작 시간 **오름차순**. **동일 시간은 면접을 이벤트보다 먼저** 표시.

**표시**: 시간 + 제목 + 타입 배지(면접 / 이벤트). 클릭 시 해당 면접 라운드 또는 이벤트 상세로 딥링크.

**Empty State**: "오늘 일정이 없어요".

**기준 시각**: "오늘"은 **KST(Asia/Seoul)** 기준 당일.

---

### 카드 5 — 공지 · 일정

기존 동아리 공개 페이지로 가는 경량 **딥링크 카드**.

**데이터**: 공지 수 + 다가오는 일정 수(경량 카운트).

- 공지: `GET /api/v1/clubs/{clubId}/notices`(페이지네이션 응답의 total/일부)
- 일정: `GET /api/v1/clubs/{clubId}/events`(다가오는 일정 수)

**표시**: 카드 명칭 **"공지 · 일정"** + "공지 N · 일정 N" + `[바로가기 →]`. 클릭 → 기존 공개 페이지 `/clubs/[clubId]`.

**Empty State**: 공지·일정 모두 0이면 "아직 공지·일정이 없어요" 표시(바로가기 링크는 유지).

---

## 7. 데이터 페칭 / Query 정책

- **서버 상태는 TanStack Query 전용**(Zustand 등에 캐싱 금지).
- 대시보드 쿼리 기본 옵션: **`staleTime: 60_000`(60초), `gcTime: 300_000`(5분)**. 카드별 조합 훅에 공통 적용한다.
- 카드별 조합 훅에서 모집/라운드 fan-out은 `useQueries`로 병렬 처리한다.
- Query Key: 대시보드 전용 키 팩토리(`dashboardQueryKeys`)를 신설하거나, 카드별로 기존 키(`clubQueryKeys`, `recruitmentQueryKeys`, `applicationQueryKeys`, `noticeQueryKeys`, `interviewRoundKeys`)를 재사용한다(가능하면 재사용 우선, 캐시 공유 이점).
- 로딩/에러 상태는 카드 단위로 격리한다(한 카드 실패가 전체 대시보드를 막지 않는다).

---

## 8. 프론트엔드 구성 (AGENTS.md 빌드 순서)

`packages/types` → `packages/api/src/client.ts` → `packages/hooks` → `_components`/`_pages` → `page.tsx`

**`packages/types`** (v1은 FE 측 타입만)
- `dashboard.ts`: `ActionItem`(타입 union), `ActionItemType`, `TodayScheduleItem`(면접/이벤트 통합), `DashboardCardCounts` 등

**`packages/api/src/client.ts`**
- 사용 엔드포인트 래퍼 확인·보강: 모집 목록, 모집 통계 summary, 면접 라운드 목록/상세, 클럽 이벤트(기간), 클럽 공지. 대부분 기존 존재, 누락분만 추가.

**`packages/hooks`**
- 카드별 조합 훅(공통 `{ staleTime: 60_000, gcTime: 300_000 }`):
  - `useClubActionItems(clubId)` — 카드1(모집·라운드 fan-out 후 업무 도출)
  - `useActiveRecruitments(clubId)` — 카드2
  - `useApplicantSummary(clubId)` — 카드3(모집별 summary 합산)
  - `useTodaySchedule(clubId)` — 카드4(면접 슬롯 + 이벤트 병합·정렬)
  - `useClubFeedCounts(clubId)` — 카드5

**`apps/web/app/manage/_components/dashboard/`**
- `ActionItemsCard.tsx`, `ActiveRecruitmentsCard.tsx`, `ApplicantSummaryCard.tsx`, `TodayScheduleCard.tsx`, `ClubFeedLinkCard.tsx`, `DashboardClubSwitcher.tsx`

**`apps/web/app/manage/_pages/`**
- `OperatorMainDashboardPage.tsx`(클라이언트 컴포넌트, 카드 조립 + `?clubId=` 처리)

**`apps/web/app/manage/page.tsx`**
- 리다이렉트 제거 → `OperatorMainDashboardPage` 렌더

---

## 9. 기본값 / 정책 요약

- 오늘 일정 = 면접 슬롯 + 클럽 이벤트 **둘 다**, **KST 기준 오늘**.
- 마감 임박 = **D-3 이내**(상수, 조정 가능).
- 진행 중 모집 = `displayStatus !== 'CLOSED'`.
- 카드 노출 = OFFICER · LEADER 동일.
- 대시보드 Query = staleTime 60초 / gcTime 5분.

---

## 10. Out of Scope (v1)

- **신규 백엔드 집계 API**(`/leader/clubs/{clubId}/action-items`, `/today-schedule`, `/recruitments/active`, `/dashboard-stats`) — v2.
- 구성원 열람용 클럽 홈 / 공지·일정 **작성 UI**(카드5는 딥링크만).
- 전체 동아리 통합(멀티클럽 집계) 뷰.
- 공지 **실시간 푸시(SSE/WebSocket)**, 공지 검색·필터, 카테고리/태그.
- 대시보드 위젯 커스터마이즈/재배치, 카드별 권한 분기.

---

## 11. v2 후속 (별도 spec, 본 문서 범위 아님)

- `GET /api/v1/leader/clubs/{clubId}/action-items` — 카드1 FE fan-out을 단일 엔드포인트로 대체(가장 큰 백엔드 이득).
- `GET /api/v1/leader/clubs/{clubId}/today-schedule` — 면접+이벤트 서버 병합.
- 카드2/3용 모집·지원자 집계 엔드포인트(`/recruitments/active`, `/dashboard-stats`).

각 v2 엔드포인트는 `clubId` 스코프로 `ClubAuthService.requireManager`를 거친다.

---

## 12. 구현 시 확정할 항목(설계 제약 아님)

- 면접 라운드 상태 enum 및 "응답 미수집 / 결과 미발표" 판별 필드의 정확한 명칭(백엔드 응답 스키마 확인).
- 카드3에서 모집 여러 개일 때 통계 페이지 딥링크 대상(목록 vs 대표 모집).
- 대시보드와 `ManageShell` 사이드바의 통합 형태.
