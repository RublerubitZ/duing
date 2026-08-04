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
| **평가 삭제 (`deleteMine`)** | 운영진 (문서 리뷰 발견 — 읽기 전용 화면에서 도달 가능한 파괴적 쓰기, "조회만 허용" 원칙의 귀결로 차단) |
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
4. **쿼리 에러 상태 (문서 리뷰 반영)**: 모집 목록 조회 실패 시 일반 Empty State 로 떨어뜨리지 않는다 — "새 모집을 등록해 주세요"는 장애 중 오해를 유발한다. 에러 안내 + 재시도 렌더(기존 에러 표시 컨벤션)를 별도 분기로 둔다.
5. 게이트는 fail-open 원칙 — 상태 값이 미지/로딩이면 차단하지 않는다 (배포 전환기 전면 소실 방지 전례).

## 3. 모집 전환 UI · 내비게이션

- **Create:** `applicants/_components/RecruitmentSwitcher.tsx` — 지원현황 헤더에 드롭다운(기존 shadcn `dropdown-menu` 재사용). 데이터는 동일 `useClubRecruitmentsQuery`. 2그룹: **진행 중**(§1-2) / **지난 모집**(자체 폼 CLOSED, '마감' 뱃지, §5 정렬). 현재 모집 표시, 선택 시 해당 모집 지원현황으로 라우트 이동. 외부 폼 모집 제외.
- **Modify:** `apps/web/app/manage/_components/ManageNav.tsx` — '지원자' 메뉴: 모집 컨텍스트 안에서는 현행(그 모집의 지원현황) 유지, **모집 미선택 시 비활성 대신 진입 라우트(`…/applicants`)로 활성화**. EXTERNAL 힌트 분기(`외부 폼 모집은 사용하지 않아요`)는 현행 유지.
- **Modify:** `recruitments/_components/PastRecruitmentsTable.tsx` — 행 액션에 **"지원자" 링크 추가** (`…/recruitments/{id}/applicants`) — 기존 3-hop 을 1-hop 으로. 외부 폼 모집 행은 링크 제외.
- **표면별 "지난 모집" 기준 차이는 의도 (문서 리뷰 반영·명시)**: 모집 관리의 PastRecruitmentsTable 모집단은 기존대로 `displayStatus === 'CLOSED'`(캠페인 기간 관점 — 마감일 경과·심사 중 raw-OPEN 포함), 진입 페이지·스위처의 "지난 모집" 그룹은 raw `status === 'CLOSED'`(읽기 전용 관점). 마감일이 지났지만 심사 중인 모집은 모집 관리 표에는 "지난 모집"으로 뜨되 그 행의 "지원자" 링크는 **전 기능 화면**으로 간다(심사 진행 중이므로 정상), 스위처에서는 "진행 중" 그룹에 속한다.

## 4. BE 읽기 전용 가드 (진짜 가드는 BE — FE 는 표면)

신설 예외 2종과 **API 계약 (사용자 확정 — FE 가 동일 코드 기준으로 토스트·예외 처리를 일관 구현)**:

| 항목 | 계약 |
|---|---|
| HTTP Status | **409 Conflict** |
| Error Code | **`RECRUITMENT_CLOSED`** (두 예외 공통 — 같은 원인) |
| 응답 형태 | 기존 `ApiResponse.error(message, code)` — `ApplicationException` 의 machine-readable `code` 필드 사용 (기성 인프라, 신규 응답 스키마 없음) |

- 운영진용: `RecruitmentException.ClosedRecruitmentReadOnlyException` — "마감된 모집은 조회만 가능합니다." + code `RECRUITMENT_CLOSED`
- 지원자용: `ApplicationDomainException.CannotWithdrawClosedRecruitmentException` — "마감된 모집의 지원은 철회할 수 없어요." + code `RECRUITMENT_CLOSED` ('보류' 등 내부 상태 미노출)

가드 지점 5곳 (각각 recruitment 로드 지점에 1분기 — withdraw 만 현재 recruitment 미접근이라 lazy SELECT 1회가 추가되며 무해, 그 외는 기로드):
1. `GeneralApplicationService.updateStatus` — `requireManager` 직후. **벌크는 건별로 이 메서드를 경유하므로 자동 커버** (건별 실패 `failures[]` 사유로 전파 — 기존 부분 실패 UI 가 그대로 표시).
2. `GeneralApplicationEvaluationService` upsert — application→recruitment 로드 후.
3. `GeneralApplicationEvaluationService.deleteMine` — 동일 지점 (지원자 상세의 평가 삭제 버튼으로 UI 도달 가능한 파괴적 쓰기).
4. `GeneralInterviewRoundService.createRound` — recruitment 검증 지점.
5. `GeneralApplicationService.withdraw` — 상태 가드(SUBMITTED·ON_HOLD) 앞에 모집 마감 가드 (마감이 상태보다 우선 안내).

**구현 시 전수 확인 의무**: 지원현황·지원서에 도달 가능한 쓰기 경로가 위 5곳이 전부인지 leader/지원자 API 전수 grep 으로 확정하고 PR 본문에 결과 기록. 전수 grep 에 걸리지만 **의도적으로 이번 범위 밖**인 경로(Out of Scope·§9 에 명명): 면접 라운드 내부 쓰기(배정·제외·확정) 및 **지원자 면접 가능시간 제출(`PUT /applications/{id}/interview-availability`)** — 면접 라운드 진행 흐름 소관으로 후속 일괄 검토.

조회(지원자 목록·상세·이웃·통계 summary/daily/funnel)는 CLOSED 에서도 현행 그대로 — 가드 추가 금지.

**동시성 주의 (수용된 race)**: `close()` 와 가드 5곳 모두 무잠금이라, 마감과 동시에 진행된 쓰기가 통과할 수 있는 ms 단위 창이 있다. 그 결과 상태는 "마감 직전에 합법적으로 수행된 액션"과 구분 불가하므로 수용한다 (철회·라운드 생성 포함). 벌크는 건별로 fresh 읽기를 하므로 마감 확정 이후 건은 정상적으로 409 로 떨어진다. 다만 `createRound` 만은 창을 통과하면 마감 모집에 라운드가 잔존하므로(취소로 정리는 가능) recruitment 행잠금 도입을 §9 후속으로 검토한다.

## 5. closedAt 노출·아카이브 정렬

- **Modify:** `RecruitmentSummaryQuery`/`RecruitmentSummaryResponse` — `closedAt`(nullable, ISO datetime) **마지막 필드로 추가만** (positional record — 기존 순서 불변). FE `packages/types` 동기 + `pnpm gen:api` 재생성.
- **Create:** FE 정렬 유틸 `sortPastRecruitments` (위치: `clubs/[clubId]/_lib/` — 진입 페이지·스위처·지난 모집 표 3개 라우트가 소비하므로 라우트 상위 승격, FE 컨벤션 준수).
- **종료 시점 키 (lazy-close 스큐 대응 — 문서 리뷰 반영)**: `closedAt` 은 실제 종료가 아니라 스탬프 시점이다 — 마감일이 지난 raw-OPEN 모집이 수개월 뒤 신규 모집 등록 시점에 lazy 마감되면 스탬프가 실제 종료보다 늦다. 따라서 정렬·표기의 종료 시점 키는:
  - 기간 모집: **`min(closedAt 의 날짜부, endDate)`** — 조기 마감이면 closedAt, lazy-close 스큐면 endDate 가 잡힌다. closedAt null(레거시)이면 endDate.
  - 상시모집(endDate null): closedAt (수동 마감이 곧 실제 종료). closedAt 도 null 인 레거시 상시는 startDate 폴백.
  - 비교는 KST 기준 날짜 문자열 부등호 — closedAt 의 날짜부는 **KST 변환 후** 추출한다 (아래 직렬화 참조).
- **직렬화 (Task 2 구현 확정 — 스펙 초안 정정)**: `closedAt` 응답은 **Instant(`…Z`, ISO-8601 UTC)** 다 — TIMEZONE.md 의 "신규 API 는 Event Time 을 오프셋 없는 문자열로 반환 금지" 절대 규칙과 `JoinCodeResponse.joinExpiresAt` 전례(Query=LocalDateTime → Response=Instant, `seoulWallClockToInstant`)를 따른다. FE 는 **문자열 `slice(0,10)` 금지** — UTC 날짜를 잘라 KST 자정 부근(00:00~09:00)에 하루 어긋난다. 기존 KST datetime 유틸(`@duing/hooks/datetime` 의 parseKstInstant/formatDateKst 계열)로 KST 날짜를 추출해 endDate(KST date)와 비교·표기한다. TIMEZONE.md regime 대응표 갱신 포함.
- 마감일 표기: 위 종료 시점 키를 날짜로 표기(시각 불요). 키가 startDate 폴백인 레거시 상시는 기존 표기 유지.
- 참고: `RecruitmentSummaryResponse` 는 공개 캘린더 응답과 공유되어 closedAt 이 캘린더에도 노출된다 — 마감은 공개 정보라 무해(의도 명시).

## 6. FE 읽기 전용 표면

게이트 기준: 각 페이지가 이미 보유한 `useRecruitmentDetailQuery` 의 **raw `status === 'CLOSED'`** (displayStatus 아님 — 마감일 경과·심사 중 모집은 전 기능 유지).

**fail-open 기준 (사용자 확정 문구)**: API 응답을 아직 받지 못한 경우(로딩·에러로 status 미확인)에만 fail-open 을 적용하며, **`Recruitment.status` 가 확인되는 즉시 읽기 전용 정책을 적용한다.** 즉 로딩 중엔 액션 노출을 유지하되(전환기 전면 소실 방지), status 가 CLOSED 로 확인되면 지체 없이 배너·숨김이 적용되고, CLOSED 외 값으로 확인되면 전 기능이 유지된다. 최종 방어선은 BE 409(`RECRUITMENT_CLOSED`) — fail-open 창에서 액션이 실행돼도 데이터는 훼손되지 않는다.

- 지원현황 목록: 상단 배너 **"마감된 모집 — 조회 전용입니다."** + 체크박스 숨김(→ BulkActionBar 자연 미노출) + 필터·검색·목록·통계 링크는 그대로.
- 지원자 상세: `StatusActionBar` → 읽기 전용 안내로 대체("마감된 모집은 상태를 변경할 수 없습니다"), `EvaluationPanel` 입력 비활성 + 동일 안내, **`MyEvaluationCard` 의 평가 삭제 버튼 숨김**(§1-3 차단 표 대응), 타임라인·지원서·프로필 조회 유지. 면접 카드의 [면접 관리] 링크는 유지(조회 성격).
- **StatusActionBar 실패 토스트 (번들)**: 단건 상태 변경 mutation 의 실패가 현재 무피드백(조용한 실패 — 기존 결함)이라, onError 에 기존 토스트 패턴으로 실패 안내를 추가한다. 같은 컴포넌트를 이번에 손대므로 여기서 함께 해소.

## 7. 테스트

- BE: 가드 5종 각각 — CLOSED 에서 409(+code `RECRUITMENT_CLOSED`) + OPEN(마감일 경과 포함)에서 정상 동작 + CLOSED 에서 조회·통계는 정상. 벌크는 CLOSED 모집 건이 `failures[]` 로 떨어지는 부분 실패 케이스. closedAt 노출(응답 필드·null 허용). `@DisplayName` 요구사항 문장·상대 날짜.
- FE: 진입 페이지(리다이렉트/Empty/외부 폼 전용 문구/지난 모집 목록), 드롭다운 그룹·외부 폼 제외, 읽기 전용 게이트(CLOSED 숨김 + **미지 상태 fail-open 유지**), 정렬 유틸(null·상시 폴백), 실패 토스트, PastRecruitmentsTable 링크.
- 실브라우저 QA 1회: 진입 자동 이동·드롭다운 전환·CLOSED 배너/액션 소실·철회 차단 안내 (기존 QA 셋업 재사용).

## 8. PR·릴리스

- **PR-A** `feat(backend): 마감 모집 읽기 전용 가드·마감 시각 노출` — 가드 4종 + 예외 2종 + closedAt 노출 + 테스트. 마이그레이션 없음.
- **PR-B** `feat(frontend): 지원현황 진입 개편 — 클럽 단위 진입·모집 전환·마감 아카이브` — 진입 라우트·드롭다운·내비·읽기 전용 표면·정렬·토스트 + gen:api. **PR-A 브랜치에 스택**(closedAt 타입 의존, 머지 시 base 재지정·rebase — 스택 PR 전례).
- 배포 순서 무관(양방향 안전): 구 FE + 신 BE 창은 CLOSED 액션이 BE 409 로 거부되어 **데이터 훼손 없음** (단 구 FE 단건 상태 변경은 기존 무피드백 결함이라 안내 없이 실패할 수 있다 — 벌크·철회는 기존 실패 표시 존재), 신 FE + 구 BE 창은 closedAt undefined → 폴백 정렬·표기 (fail-open 게이트라 액션 소실 없음). 단일 릴리스 강제 불요.
- FSM 릴리스(#863/#864)와의 관계: 본 작업은 develop 기준 후속이며 prod 릴리스 시점은 사용자 결정 사항(현재 릴리스 보류 중).

## 9. 후속 정책 검토 항목 (이번 범위 밖, 명시 보존)

- 마감 시점 진행 중 면접 라운드의 정리 정책 (강제 취소 vs 방치 — 현재 방치)
- 면접 라운드 내부 쓰기(배정·제외·확정)와 **지원자 면접 가능시간 제출(`PUT /applications/{id}/interview-availability`)**의 CLOSED 가드 필요성 — 라운드 진행 흐름과 함께 일괄 검토
- `createRound` 의 recruitment 행잠금 (마감과 라운드 생성의 직렬화 — §4 수용된 race 참조)
- ~~lazy-close 리뷰 프리즈 UX — 새 모집 등록이 기존 만료-OPEN 모집을 자동 마감해, 진행 중이던 심사 액션이 일괄 409 로 전환되는 커플링. 모집 등록 확인 UI 에서의 고지 검토~~ **완료** — 신규 모집 작성 화면에서 제출 직전 확인 다이얼로그로 고지한다.
  - 트리거: `useClubRecruitmentsQuery` 목록에 `status === 'OPEN' && displayStatus === 'CLOSED'` 인 모집이 있을 때(= 마감일이 지난 채 OPEN 으로 남은 모집 = BE 자동 마감 대상). 활성 모집은 동아리당 1건뿐이라(V38 부분 유니크 인덱스) 대상도 최대 1건. 목록 미로딩·실패로 판정 불가면 다이얼로그 없이 그대로 제출한다(fail-open).
  - 확정 문구(변경 금지) — 제목 **"기존 모집을 마감하시겠습니까?"** / 본문 **"새 모집을 등록하면 현재 진행 중인 모집 '{모집명}' 이 마감 처리됩니다."**, **"마감된 모집은 지원현황이 조회 전용으로 전환되며, 지원 상태 변경, 평가, 면접 라운드 생성이 불가능합니다."**, **"계속하시겠습니까?"** / 버튼 **취소 · 등록 및 마감**.
  - `POST /leader/clubs/{clubId}/recruitments/replace-active` 는 FE 에 배선된 호출부가 없어(생성 스키마에만 존재) 교체 경로의 고지는 대상 없음 — 해당 흐름을 FE 에 노출할 때 같은 다이얼로그를 재사용한다.
- 아카이브 지원자 CSV/증적 내보내기
- 통계 화면 모집 전환 드롭다운 확장
