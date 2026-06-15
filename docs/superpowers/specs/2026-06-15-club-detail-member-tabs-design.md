# 동아리 상세 멤버 전용 공지/일정 탭 설계

- 날짜: 2026-06-15
- 범위: `/clubs/{clubId}` 상세 페이지 탭에, **가입한 멤버에게만** 공지/일정 미리보기 탭 추가 (프론트엔드 전용).

## 목표

멤버가 동아리 상세 페이지에서 기존 4탭(소개/활동/Q&A/상세정보)에 더해 **공지 / 일정** 탭을 보고, 최근 공지·일정을 빠르게 확인한 뒤 전체는 기존 `/member` 영역으로 이어볼 수 있게 한다. (A안 — 미리보기 + 링크)

## 결정 사항

- **노출 조건:** 해당 동아리에 가입한 사용자(`useClubMembershipQuery`가 멤버십을 반환)에게만. 비멤버·비로그인은 기존과 100% 동일.
- **콘텐츠:** 읽기 전용 미리보기(최근 N건) + "전체 보기 →" 링크. 작성/수정/삭제 관리 UI는 추가하지 않는다(기존 `/member`가 담당).
- **기존 멤버 컴포넌트(`ClubNoticeList`/`ClubEventList`)·/member 라우트는 건드리지 않는다.** 가벼운 미리보기 컴포넌트 2개만 신규 추가.

## 아키텍처

- **데이터 페칭은 페이지에서, `ClubDetailTabs`는 prop-driven 유지.**
  - `app/clubs/[clubId]/page.tsx`: `useAuthStore`로 인증 여부 확인 후 `useClubMembershipQuery(isAuthenticated ? clubId : null)` 호출(비로그인 시 `null`로 비활성화 → 불필요한 401 방지). 결과 `membership`을 `ClubDetailTabs`에 prop으로 전달.
  - 인증된 비멤버는 백엔드가 403(NotAMember)을 주므로 `membership`은 `undefined` → 탭 미노출. (403/404는 401이 아니라 세션 만료 핸들러를 트리거하지 않음)
- **`ClubDetailTabs`**: `membership?: MyClubMembership | null` prop 추가. 값이 있으면 기존 탭 뒤에 `공지`/`일정` 탭 + 콘텐츠(`ClubDetailNotices`/`ClubDetailEvents`, `clubId` 전달)를 덧붙인다. prop 없으면 기존 동작 그대로(기존 테스트 무변경).

## 신규 컴포넌트 (`app/clubs/[clubId]/_components/`)

- **`ClubDetailNotices.tsx`** — `useClubNoticeListQuery(clubId, 0)`로 받아 최근 **4건**을 읽기 전용 컴팩트 행(고정 배지 + 제목 + 작성일)으로. 각 행 → `/clubs/{clubId}/member/notices/{id}`. 헤더에 "전체 보기 →" → `/clubs/{clubId}/member/notices`. 로딩/빈 상태("등록된 공지가 없어요.") 처리.
- **`ClubDetailEvents.tsx`** — `useClubEventListQuery(clubId)`로 받아 앞 **4건**을 컴팩트 행(제목 + 일시 + 장소)으로. 각 행 → `/clubs/{clubId}/member/events/{id}`. "전체 보기 →" → `/clubs/{clubId}/member/events`. 로딩/빈 상태 처리.

## 테스트

- `ClubDetailTabs`: membership prop 있으면 공지/일정 탭 트리거 노출 / 없으면 미노출(기존 4탭 동작 유지). (Radix Tabs는 비활성 콘텐츠를 마운트하지 않으므로 트리거 노출만 검증)
- `ClubDetailNotices`·`ClubDetailEvents`: 미리보기 행 N건 렌더 + "전체 보기" 링크 경로 + 빈 상태. (목록 훅 모킹)

## Out of Scope

- `/member` 라우트·기존 멤버 컴포넌트 변경.
- 상세 페이지에서의 공지/일정 작성·수정·삭제(관리).
- 일정 "다가오는 것만" 필터링(목록 앞 N건만 표시).
- 탭 순서/개수 사용자 커스터마이즈, 미리보기 건수 설정 UI.
- 멤버십 변동 시 실시간 갱신(기존 staleTime 정책 따름).
