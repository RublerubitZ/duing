# 지원현황 아카이브·모집 마감 읽기 전용 설계 스펙 — 클럽 단위 진입·모집 전환·CLOSED 가드

- 작성일: 2026-08-04
- 상태: 확정 — 사용자 승인 (진입 정책 사용자 제시 · 철회 차단 포함 결정 · 진입 라우트/드롭다운/closedAt 활용/BE 가드/PR 분리 승인)
- 전제: 지원 상태 머신 단순화(#863/#864) develop 머지 완료 — `ApplicationStatus` = SUBMITTED/ON_HOLD/INTERVIEW_PENDING/ACCEPTED/REJECTED. 지원자 조회는 이미 recruitment 단위(`GET /leader/recruitments/{recruitmentId}/applications`)라 모집 간 지원자 섞임은 구조적으로 불가능. `recruitment.closed_at` 은 V101 로 존재하며 마감 경로 4곳(수동 마감·create 시 lazy 마감·replace-active·폐쇄 cascade)이 전부 스탬프하지만 **레거시 CLOSED 행은 백필 없음(null)·응답 미노출**. 운영진용 모집 목록 API 는 없음 — 공개 `GET /clubs/{clubId}/recruitments` 재사용(CLOSED 포함 전량, OPEN 우선·startDate desc). ManageNav 는 모집 미선택 시 '지원자' 비활성 + 외부 폼(EXTERNAL) 모집 별도 힌트 분기 보유.
- 배경: 지원현황이 모집 URL 에 종속되어 진입 동선이 3-hop 이고, 마감(CLOSED)된 모집에서도 모든 운영 액션이 그대로 동작한다. 시간이 지날수록 현재 모집 관리가 어려워지므로 **현재 모집만 기본 노출하고, 마감 모집은 데이터 삭제 없이 읽기 전용 아카이브로 분리**한다.

## Out of Scope (명시적 제외)

- 통계 API 재설계 — funnel 면접 진입 이력 기반 집계는 #862 별도 트랙.
- 면접 도메인의 마감 후 심화 대응 — **라운드 신규 생성 차단은 이번 범위**지만, 마감 시점에 이미 진행 중인 라운드의 강제 취소/정리, 배정·제외·확정 등 라운드 내부 쓰기의 CLOSED 가드는 다루지 않는다 (정상 흐름상 마감은 심사 완료 후이며, 라운드 내부 흐름은 별도 화면 소관 — 후속 검토 항목).
- `closedAt` 백필 — 레거시 CLOSED 행의 마감 시각 데이터가 존재하지 않아 불가. 정렬 폴백(§5)으로 흡수하고 백필 마이그레이션은 만들지 않는다.
- 모집 아카이브의 CSV/증적 내보내기 확장, `club_audit_event` 에 CLOSED 관련 감사 이벤트 추가 (YAGNI — 요구 발생 시 기성 감사 패턴 사용).
- 통계(stats) 화면의 모집 전환 드롭다운 — 이번엔 지원현황만. 통계는 기존 진입 경로 유지.
- 클럽 전역/학생 노출 표면의 모집 필터 변화 — 운영진 콘솔 한정.

## 1. 정책 (사용자 확정)

### 1-1. 진입 정책

지원현황은 **클럽 단위 진입점** `/manage/clubs/[clubId]/applicants` 를 기준으로 한다.

- 진행 중 모집이 있으면 → 해당 모집의 지원현황으로 자동 이동.
- 없으면 → Empty State + 지난 모집(아카이브) 목록 표시.
- 지원현황 화면 내부에서 모집 전환 드롭다운 제공 (진행 중 / 지난 모집 2그룹).

### 1-2. "진행 중"의 정의

**`status === 'OPEN'` 이면서 자체 폼(`applicationMode === 'SELF'`) 모집.** 마감일(endDate)이 지났어도 수동 마감 전이면 심사 진행 중이므로 진행 중으로 취급한다 — 심사는 마감일 이후에 진행되는 실제 운영 흐름을 보호 (displayStatus 기준이 아님. 기존 전례: 모집 삭제·수정 가드 모두 raw status 기준). 외부 폼 모집은 지원자 관리 자체가 없으므로 진입·드롭다운 대상에서 제외.

### 1-3. 읽기 전용 정책

`recruitment.status === CLOSED` 인 모집은 **아카이브** — 조회(지원자 목록·지원서·상태·이력·통계)만 허용하고 다음을 차단한다:

| 차단 대상 | 행위자 |
|---|---|
| 지원 상태 변경 (단건·벌크) | 운영진 |
| 평가(evaluation) 저장 | 운영진 |
| 면접 라운드 신규 생성 | 운영진 |
| **지원 철회** | 지원자 (사용자 확정 — 아카이브 데이터 보존 우선. 모집 마감은 공개 정보라 차단 사유 노출 무해) |

지원 데이터는 어떤 경로로도 삭제·변형되지 않는다 (기존 원칙 유지 — 삭제 로직 자체가 없음).

## 2. 진입 라우트

**Create:** `frontend/apps/web/app/manage/clubs/[clubId]/applicants/page.tsx` (client component — 기존 `useClubRecruitmentsQuery(clubId)` 재사용, ManageGuard 는 상위 layout(#840 공통화)이 자동 커버)

로직:
1. 모집 목록 로딩 중 → 공용 LoadingGate (로딩 UI 컨벤션 준수).
2. 진행 중(§1-2) 모집 존재 → 첫 항목(BE 정렬이 OPEN 우선·startDate desc 라 최신 OPEN)으로 `router.replace(…/recruitments/{id}/applicants)` — 새 화면 구현 없이 기존 지원현황 페이지 재사용. 복수 OPEN(상시모집 병행 등)도 최신으로 가고 드롭다운으로 전환.
3. 진행 중 없음 → 이 페이지가 렌더. **CTA 는 상황에 따라 분기한다 (사용자 확정):**
   - 진행 중 SELF 모집이 없는 일반 케이스 — Empty State: **"현재 진행 중인 모집이 없습니다."** / 부제 **"새 모집을 등록해 주세요."** + CTA **"새 모집 등록"** → 모집 등록(`…/recruitments/new`).
   - OPEN 이 외부 폼뿐인 케이스 — 전용 문구: **"진행 중인 모집이 외부 폼으로 운영되고 있어요. 외부 폼 모집은 지원자 관리를 사용하지 않아요."** + CTA **"모집 관리로 이동"** → 모집 관리(`…/recruitments`). 외부 폼 모집은 지원자 관리 대상이 아니므로 사용자 행동을 모집 관리로 유도.
   - 아래에 **지난 모집 목록**: 자체 폼 CLOSED 모집을 §5 정렬로, 제목·기간·마감일(closedAt 있으면)·"지원자 보기" 링크.
4. 게이트는 fail-open 원칙 — 상태 값이 미지/로딩이면 차단하지 않는다 (배포 전환기 전면 소실 방지 전례).

## 3. 모집 전환 UI · 내비게이션

- **Create:** `applicants/_components/RecruitmentSwitcher.tsx` — 지원현황 헤더에 드롭다운(기존 shadcn `dropdown-menu` 재사용). 데이터는 동일 `useClubRecruitmentsQuery`. 2그룹: **진행 중**(§1-2) / **지난 모집**(자체 폼 CLOSED, '마감' 뱃지, §5 정렬). 현재 모집 표시, 선택 시 해당 모집 지원현황으로 라우트 이동. 외부 폼 모집 제외.
- **Modify:** `apps/web/app/manage/_components/ManageNav.tsx` — '지원자' 메뉴: 모집 컨텍스트 안에서는 현행(그 모집의 지원현황) 유지, **모집 미선택 시 비활성 대신 진입 라우트(`…/applicants`)로 활성화**. EXTERNAL 힌트 분기(`외부 폼 모집은 사용하지 않아요`)는 현행 유지.
- **Modify:** `recruitments/_components/PastRecruitmentsTable.tsx` — 행 액션에 **"지원자" 링크 추가** (`…/recruitments/{id}/applicants`) — 기존 3-hop 을 1-hop 으로. 외부 폼 모집 행은 링크 제외.

## 4. BE 읽기 전용 가드 (진짜 가드는 BE — FE 는 표면)

신설 예외 2종과 **API 계약 (사용자 확정 — FE 가 동일 코드 기준으로 토스트·예외 처리를 일관 구현)**:

| 항목 | 계약 |
|---|---|
| HTTP Status | **409 Conflict** |
| Error Code | **`RECRUITMENT_CLOSED`** (두 예외 공통 — 같은 원인) |
| 응답 형태 | 기존 `ApiResponse.error(message, code)` — `ApplicationException` 의 machine-readable `code` 필드 사용 (기성 인프라, 신규 응답 스키마 없음) |

- 운영진용: `RecruitmentException.ClosedRecruitmentReadOnlyException` — "마감된 모집은 조회만 가능합니다." + code `RECRUITMENT_CLOSED`
- 지원자용: `ApplicationDomainException.CannotWithdrawClosedRecruitmentException` — "마감된 모집의 지원은 철회할 수 없어요." + code `RECRUITMENT_CLOSED` ('보류' 등 내부 상태 미노출)

가드 지점 4곳 (각각 recruitment 를 이미 로드하는 지점에 1분기 — 새 쿼리 없음):
1. `GeneralApplicationService.updateStatus` — `requireManager` 직후. **벌크는 건별로 이 메서드를 경유하므로 자동 커버** (건별 실패 `failures[]` 사유로 전파).
2. `GeneralApplicationEvaluationService` upsert — application→recruitment 로드 후.
3. `GeneralInterviewRoundService.createRound` — recruitment 검증 지점.
4. `GeneralApplicationService.withdraw` — 상태 가드(SUBMITTED·ON_HOLD) 앞에 모집 마감 가드 (마감이 상태보다 우선 안내).

**구현 시 전수 확인 의무**: 지원현황·지원서에 도달 가능한 쓰기 경로가 위 4곳이 전부인지 leader/지원자 API 전수 grep 으로 확정하고 PR 본문에 결과 기록 (면접 라운드 내부 쓰기는 Out of Scope 명시 대상).

조회(지원자 목록·상세·이웃·통계 summary/daily/funnel)는 CLOSED 에서도 현행 그대로 — 가드 추가 금지.

## 5. closedAt 노출·아카이브 정렬

- **Modify:** `RecruitmentSummaryQuery`/`RecruitmentSummaryResponse` — `closedAt`(nullable, ISO datetime) **마지막 필드로 추가만** (positional record — 기존 순서 불변). FE `packages/types` 동기 + `pnpm gen:api` 재생성.
- **Create:** FE 정렬 유틸 `sortPastRecruitments` — **`closedAt ↓ → (null 이면) endDate ↓ → (상시모집이면) startDate ↓`**. 레거시 CLOSED(closedAt null)는 폴백으로 흡수. 소비처 3곳: 진입 페이지 지난 모집 목록·RecruitmentSwitcher 지난 모집 그룹·PastRecruitmentsTable (기존 BE 정렬 위에 클라이언트 재정렬 1줄).
- 마감일 표기: closedAt 있으면 마감 시각(KST), 없으면 endDate 기반 기존 표기 유지.

## 6. FE 읽기 전용 표면

게이트 기준: 각 페이지가 이미 보유한 `useRecruitmentDetailQuery` 의 **raw `status === 'CLOSED'`** (displayStatus 아님 — 마감일 경과·심사 중 모집은 전 기능 유지).

**fail-open 기준 (사용자 확정 문구)**: API 응답을 아직 받지 못한 경우(로딩·에러로 status 미확인)에만 fail-open 을 적용하며, **`Recruitment.status` 가 확인되는 즉시 읽기 전용 정책을 적용한다.** 즉 로딩 중엔 액션 노출을 유지하되(전환기 전면 소실 방지), status 가 CLOSED 로 확인되면 지체 없이 배너·숨김이 적용되고, CLOSED 외 값으로 확인되면 전 기능이 유지된다. 최종 방어선은 BE 409(`RECRUITMENT_CLOSED`) — fail-open 창에서 액션이 실행돼도 데이터는 훼손되지 않는다.

- 지원현황 목록: 상단 배너 **"마감된 모집 — 조회 전용입니다."** + 체크박스 숨김(→ BulkActionBar 자연 미노출) + 필터·검색·목록·통계 링크는 그대로.
- 지원자 상세: `StatusActionBar` → 읽기 전용 안내로 대체("마감된 모집은 상태를 변경할 수 없습니다"), `EvaluationPanel` 입력 비활성 + 동일 안내, 타임라인·지원서·프로필 조회 유지. 면접 카드의 [면접 관리] 링크는 유지(조회 성격).
- **StatusActionBar 실패 토스트 (번들)**: 단건 상태 변경 mutation 의 실패가 현재 무피드백(조용한 실패 — 기존 결함)이라, onError 에 기존 토스트 패턴으로 실패 안내를 추가한다. 같은 컴포넌트를 이번에 손대므로 여기서 함께 해소.

## 7. 테스트

- BE: 가드 4종 각각 — CLOSED 에서 409 + OPEN(마감일 경과 포함)에서 정상 동작 + CLOSED 에서 조회·통계는 정상. 벌크는 CLOSED 모집 건이 `failures[]` 로 떨어지는 부분 실패 케이스. closedAt 노출(응답 필드·null 허용). `@DisplayName` 요구사항 문장·상대 날짜.
- FE: 진입 페이지(리다이렉트/Empty/외부 폼 전용 문구/지난 모집 목록), 드롭다운 그룹·외부 폼 제외, 읽기 전용 게이트(CLOSED 숨김 + **미지 상태 fail-open 유지**), 정렬 유틸(null·상시 폴백), 실패 토스트, PastRecruitmentsTable 링크.
- 실브라우저 QA 1회: 진입 자동 이동·드롭다운 전환·CLOSED 배너/액션 소실·철회 차단 안내 (기존 QA 셋업 재사용).

## 8. PR·릴리스

- **PR-A** `feat(backend): 마감 모집 읽기 전용 가드·마감 시각 노출` — 가드 4종 + 예외 2종 + closedAt 노출 + 테스트. 마이그레이션 없음.
- **PR-B** `feat(frontend): 지원현황 진입 개편 — 클럽 단위 진입·모집 전환·마감 아카이브` — 진입 라우트·드롭다운·내비·읽기 전용 표면·정렬·토스트 + gen:api. PR-A 머지 후 분기(closedAt 타입 의존).
- 배포 순서 무관(양방향 안전): 구 FE + 신 BE 창은 CLOSED 액션 시 409 안내(데이터 훼손 없음), 신 FE + 구 BE 창은 closedAt undefined → 폴백 정렬·표기 (fail-open 게이트라 액션 소실 없음). 단일 릴리스 강제 불요.
- FSM 릴리스(#863/#864)와의 관계: 본 작업은 develop 기준 후속이며 prod 릴리스 시점은 사용자 결정 사항(현재 릴리스 보류 중).

## 9. 후속 정책 검토 항목 (이번 범위 밖, 명시 보존)

- 마감 시점 진행 중 면접 라운드의 정리 정책 (강제 취소 vs 방치 — 현재 방치)
- 면접 라운드 내부 쓰기(배정·제외·확정)의 CLOSED 가드 필요성
- 아카이브 지원자 CSV/증적 내보내기
- 통계 화면 모집 전환 드롭다운 확장
