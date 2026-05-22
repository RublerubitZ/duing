# 어드민 프론트엔드 미구현 도메인 — 설계

작성일: 2026-05-22
대상: `frontend/apps/web/app/admin/**`
관련 백엔드: develop HEAD (PR #140 ~ #153 누적)

---

## 1. 배경

백엔드 어드민 9개 도메인 / 30개 엔드포인트 중 프론트에는 **동아리 관리·공지 관리 2개 도메인만 구현**되어 있다. 본 spec 은 나머지 7개 도메인의 어드민 프론트를 추가해 백엔드/프론트 갭을 해소한다.

| # | 도메인 | 백엔드 API | 라우트 |
|---|---|---|---|
| 1 | 신고 관리 | 목록/상세/처리 (3개) | `/admin/reports`, `/[reportId]` |
| 2 | 회장 승계 | 목록/상세/처리/강제지정/이력 (5개) | `/admin/leader-succession`, `/[requestId]`, `/clubs/[clubId]/history` |
| 3 | 재인증 라운드 | 개설/종료/목록 (3개) | `/admin/recertification/rounds`, `/new` |
| 4 | 재인증 요청 검토 | 목록/상세/처리/현황 (4개) | `/admin/recertification/requests`, `/[requestId]`, `/status` |
| 5 | 홍보 요청 검토 | 목록/상세/처리 (3개) | `/admin/promotion-requests`, `/[requestId]` |
| 6 | 홍보 배너 관리 | CRUD (4개) | `/admin/promotions`, `/new`, `/[promotionId]/edit` |
| 7 | 사용자 검색 | 단일 검색 API | (스킵 — 이미 동아리장 선택 모달 콤보박스로 통합됨) |

---

## 2. 목표

1. 7개 도메인 중 6개를 위한 어드민 프론트 페이지·훅·컴포넌트 추가 (사용자 검색은 별도 페이지 불필요)
2. 모든 작업이 기존 `clubs`/`notices` 의 5계층 폴더 구조 (`page.tsx → _pages/ → _components/ → _lib/ → _hooks/`) 와 React Query 훅 컨벤션을 따른다
3. 어드민 메인 (`/admin`) 에 6개 영역으로 진입 가능한 네비게이션 / 카드 추가

## 3. 비-목표 (Out of Scope)

- 사용자 검색 전용 페이지 — 백엔드 API 는 동아리장 선택 콤보박스가 이미 소비하고 있어 별도 라우트 불필요
- 새로운 디자인 시스템 도입 (shadcn 등) — 기존 Tailwind + 자체 컴포넌트 패턴 유지
- 어드민 토스트 전역 도입 — 현재 인라인 에러 표시 컨벤션 유지
- 어드민 외 학생용 페이지 추가
- 어드민 영역 i18n
- 어드민 영역 광범위 접근성 (a11y) 리팩토링

---

## 4. 표준 페이지 골격 (각 도메인 공통)

탐색을 통해 확인한 표준:

```
app/admin/{domain}/
├── page.tsx                        # 라우트 엔트리 (3-5줄, _pages 임포트)
├── _lib/
│   ├── {domain}Status.ts           # 상태 라벨/배지 클래스/필터 옵션
│   └── extractErrorMessage.ts      # (선택) 에러 메시지 추출 유틸
├── _pages/
│   ├── Admin{Domain}ListPage.tsx   # 200~250줄, 필터 + 페이지네이션 + 테이블
│   ├── Admin{Domain}DetailPage.tsx # (있는 경우) 상세 화면
│   └── Admin{Domain}EditPage.tsx   # (있는 경우) 수정 화면
└── _components/
    ├── Admin{Domain}Table.tsx
    ├── Admin{Domain}FilterBar.tsx
    └── Admin{Domain}ActionDialog.tsx  # 처리/거절 사유 입력 모달
```

훅:
```
packages/hooks/src/{domain}.ts
  - useAdmin{Domain}ListQuery
  - useAdmin{Domain}DetailQuery
  - useAdmin{Domain}ProcessMutation
packages/hooks/src/adminQueryKeys.ts
  - 도메인별 키 추가
packages/api/src/client.ts
  - client.admin.{domain}.{list,get,process,...}
```

## 5. 도메인별 페이지 명세

### 5.1 신고 관리 (PR FE-1)
- 라우트: `/admin/reports`, `/admin/reports/[reportId]`
- 리스트: 상태(PENDING/RESOLVED/REJECTED) × 대상타입(CLUB/RECRUITMENT) 필터, 페이지네이션
- 상세: 신고자/대상/이유/첨부, 처리(해결/기각) 액션
- 처리 다이얼로그: 상태 + 처리 사유 입력
- 의존: 백엔드 `/api/v1/admin/reports/**`

### 5.2 회장 승계 (PR FE-2)
- 라우트: `/admin/leader-succession`, `/admin/leader-succession/[requestId]`, `/admin/leader-succession/clubs/[clubId]/history`
- 리스트: 상태(PENDING/APPROVED/REJECTED) × clubId 필터
- 상세: 현재 LEADER / 승계 요청자 / 사유, 승인·거절 액션
- 강제 지정: `/admin/clubs/[clubId]` 내부 액션으로 통합 (별도 라우트 미사용)
- 이력 페이지: 동아리별 권한 변경 타임라인

### 5.3 재인증 라운드 관리 (PR FE-3)
- 라우트: `/admin/recertification/rounds`, `/admin/recertification/rounds/new`
- 리스트: 상태(OPEN/CLOSED) 필터, 개설일·종료일·신청 건수
- 신규: year + label 폼
- 종료 액션: 다이얼로그로 확인 후 PATCH

### 5.4 재인증 요청 검토 (PR FE-4)
- 라우트: `/admin/recertification/requests`, `/admin/recertification/requests/[requestId]`, `/admin/recertification/status`
- 리스트: 라운드 × 상태 필터, 동아리명 검색
- 상세: 동아리 정보 + 현 LEADER + OFFICER 목록 + 멤버 권한 이력 (recent 10)
- 처리: 승인/거절 + 거절 사유
- 현황 페이지: 중앙동아리 재인증 상태 (operating year 기준 EXPIRED 포함)

### 5.5 홍보 요청 검토 (PR FE-5)
- 라우트: `/admin/promotion-requests`, `/admin/promotion-requests/[requestId]`
- 리스트: 상태 × clubId 필터
- 상세: 요청 동아리 / 본문 / 첨부, 승인 → 배너 생성, 거절 → 사유

### 5.6 홍보 배너 관리 (PR FE-6)
- 라우트: `/admin/promotions`, `/admin/promotions/new`, `/admin/promotions/[promotionId]/edit`
- 리스트: 활성화 × clubId 필터, 노출 순서 변경(드래그 미정 — 폼 수정으로 처리)
- 폼: 타이틀, 본문, 링크, 이미지, 대상 동아리(선택), 노출 기간, 활성화 토글

### 5.7 어드민 홈 네비 (PR FE-7)
- 라우트: `/admin` 의 redirect 제거 → 6개 영역 카드형 네비
- 의존: FE-1 ~ FE-6 머지 후 카드 링크 활성

---

## 6. PR 분할

총 7 PR. 도메인별 1 PR (프론트 CLAUDE.md "페이지 단위 PR" 원칙).

| PR | 브랜치 | 범위 |
|---|---|---|
| FE-1 | `feat/admin-reports-frontend` | 신고 리스트 + 상세 + 처리 |
| FE-2 | `feat/admin-leader-succession-frontend` | 회장 승계 리스트 + 상세 + 처리 + 이력 |
| FE-3 | `feat/admin-recertification-rounds-frontend` | 재인증 라운드 리스트 + 개설 + 종료 |
| FE-4 | `feat/admin-recertification-requests-frontend` | 재인증 요청 검토 + 현황 |
| FE-5 | `feat/admin-promotion-requests-frontend` | 홍보 요청 검토 |
| FE-6 | `feat/admin-promotions-frontend` | 홍보 배너 CRUD |
| FE-7 | `feat/admin-home-navigation` | `/admin` 네비 카드 |

### 권장 머지 순서

> FE-3 (라운드) → FE-4 (요청) 순서가 도메인 의존상 자연스러움. 나머지 (FE-1, FE-2, FE-5, FE-6) 는 독립. FE-7 은 마지막에.

1. **FE-1** (신고) — 단순, independent, 안전망 가치 높음
2. **FE-2** (회장 승계) — independent workflow
3. **FE-3** (재인증 라운드) — 4의 선행
4. **FE-4** (재인증 요청)
5. **FE-5** (홍보 요청)
6. **FE-6** (홍보 배너)
7. **FE-7** (어드민 홈)

각 PR 평균 작업량: 신규 파일 ~10개, 200~400 LOC.

---

## 7. 공통 인프라 (FE-1 작업 중 함께 도입)

- `packages/types/src/admin/*.ts` — Request/Response 타입 (백엔드 DTO 기준)
- `packages/api/src/client.ts` — `client.admin.{domain}.*` 메서드 추가
- `packages/hooks/src/adminQueryKeys.ts` — 도메인별 키 전략
- `apps/web/app/admin/_lib/timestamp.ts` — 공통 날짜 표시 헬퍼 (선택, FE-1 에서 필요 시 신설)

---

## 8. self-check (PR 직전 7개 항목)

각 PR 머지 직전:
1. 브랜치명 `feat/{설명}-frontend` 규칙
2. 커밋 메시지 `feat(frontend): ...` Conventional Commits
3. PR 본문 — 🚀/🤔/💬 자연스러운 글
4. 기존 `clubs`/`notices` 페이지의 5계층 구조 + 훅 패턴 준수
5. Out of Scope 항목 미포함
6. 시크릿/하드코딩 없음
7. `pnpm --filter web build` 통과 (CI 가 같은 명령 실행)
