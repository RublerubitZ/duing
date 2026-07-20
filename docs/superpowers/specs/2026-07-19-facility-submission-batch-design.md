# 시설 예약 학교 제출 관리(Submission Batch) 설계

> 2026-07-19 초판 승인 · **2026-07-20 운영 중심 전면 개편(v2)** — 실제 총동연 시설 담당자의 월간 제출 프로세스 기준.
> 기존 예약 상태 머신(PENDING→APPROVED→CONFIRMED 외 REJECTED/CONFLICT/CANCELLED)은 **일절 변경하지 않는다**.
> Submission 은 booking 을 스칼라 ID 로만 참조하는 **독립 Aggregate** 다.

## 1. 개요 — Batch 는 "학교 제출 대상 관리 단위"다

Submission Batch 는 학교 제출을 자동화하는 기능이 **아니다**. 담당자의 월간 제출 업무를 지원하는 운영 도구다.

```
학생 신청 → 총동연 승인(APPROVED) → 제출 필요 목록 관리 → Submission Batch 생성(제출 대상 묶음)
  → 담당자 검토 → 학교 제출(담당자 수동) → Batch 완료 처리 → 학교 등록(CONFIRMED)
```

시스템의 지원 범위: 제출 대상 관리 · 동아리별 그룹핑 · 검색 · 제출 여부 관리 · Batch 관리/이력 · CSV Export(선택) · 운영 현황 조회 · Batch 완료 처리.
학교 제출용 문서 작성과 제출 절차 자체는 담당자의 운영 업무로 유지한다.

### 용어 정의

| 용어 | 정의 |
|---|---|
| **제출 필요** | APPROVED 이면서 활성 Batch 에 미포함(파생 상태 — DB 컬럼·신규 Status 없음) |
| **제출함** | 활성 Batch(취소 아님)에 포함됨(동일하게 파생) |
| **검토 중** | Batch 기본 상태 — 생성됐고 완료·취소되지 않음 |
| **제출 완료** | 담당자가 실제 학교 제출을 마치고 Batch 를 완료 처리함(`completedAt`) — 포함 예약은 CONFIRMED 로 전이 |
| **취소됨** | Batch 취소(`cancelledAt`) — 포함 예약은 제출 필요로 자연 복귀 |

Batch 취소 시 booking 은 건드리지 않는다 — item 이 비활성화되며 자연히 제출 필요로 복귀한다
(이미 CONFIRMED 된 booking 은 후보 조건에 안 걸리므로 복귀하지 않음 — 의도된 동작).

**UI Copy 원칙(v2.2)**: 위 용어는 도메인 내부 용어다. 사용자 화면 문구에는 도메인 용어를 노출하지 않는다 —
Batch → **"제출 목록"**, 제출 필요 → **"학교에 제출할 예약"**, 제출함 → **"제출 목록에 담김/담긴 예약"**.
코드·API·테이블 명칭(Batch/Submission)은 불변이고 화면 문구만 이 표기를 쓴다.

### Scope — 현재 구현 / 향후 확장

**현재 구현**: Submission Batch 관리 전체 + CSV Export(선택 기능)

**향후 확장 (별도 스펙, 이번 구현 없음)**: PDF Export — Export 계층(§6)이 Writer 추가만으로 수용

**로드맵에서 제거(v2)**: ~~HWP 신청서 자동 생성~~, ~~학교 담당자 메일 자동 발송~~, ~~발송 이력 관리~~, ~~학교 행정 시스템 연동~~
— 실제 운영 프로세스와 맞지 않으며 담당자의 업무를 대체하지 않는다.

### Out of Scope

- 학교 제출 자체의 자동화(문서 생성·발송) — 담당자 수동 업무
- 알림(제출/취소 알림) 연동
- REJECTED 예약의 표시 (운영 노이즈 — 후보 응답에서 제외)
- RN 앱 화면
- 기존 관리자 승인 큐 화면 변경

## 2. 백엔드 — 도메인 모델 & DB

새 도메인 패키지 `domain/facilitysubmission/` (구현 완료 — PR #682 develop 머지). booking·facility·user 는 전부 스칼라 ID 참조.

### V87 (적용 완료) — 테이블 4개

**facility_submission_batch**: id, submission_no(VARCHAR 20 UNIQUE), facility_id, submitted_by, submitted_at, memo(500), csv_file_name(100), cancelled_at, cancelled_by, BaseEntity 컬럼.
cancelled_at 은 soft delete 가 아니라 **비즈니스 상태**(`@SQLRestriction` 미적용 — 취소돼도 이력에 계속 표시).

**facility_submission_item**: batch_id(FK), booking_id. batch 에 완전 종속 — 자체 취소 컬럼 없음.
중복 제출 방지는 애플리케이션 레벨(booking ID 정렬 행잠금 + 활성 EXISTS, §4)이 보장한다.

**facility_submission_seq**: seq_date(DATE PK), next_value — 채번 전용.

**facility_submission_audit**: batch_id, action(VARCHAR 20), admin_id, ip_address(45), user_agent(500, 절단 내장) — append-only.

### V88 (신규 — PR-3) — Batch 완료 처리 컬럼

```sql
ALTER TABLE facility_submission_batch
    ADD COLUMN completed_at TIMESTAMP,
    ADD COLUMN completed_by BIGINT REFERENCES users (id);

-- 사람이 읽는 감사 요약(§4.3) — auth_event.detail 전례(500 + 절단 내장)
ALTER TABLE facility_submission_audit
    ADD COLUMN detail VARCHAR(500);
```

Batch 상태는 3종 파생: `completedAt != null` → 제출 완료 / `cancelledAt != null` → 취소 / 둘 다 null → 검토 중. **상호 배타**(§4.3 가드).
`SubmissionAuditAction` 에 `COMPLETED` 추가. `FacilitySubmissionAudit` 엔티티에 `detail`(500, 절단 내장) 필드 추가 — 기존 4이벤트는 detail null 유지(하위호환).

## 3. submissionNo 채번 (불변 — 구현 완료)

`SUB-YYYYMMDD-NNN`(seoulClock 제출일, 일별 3자리·1000 이상 자연 확장). `facility_submission_seq` 선삽입(`ON CONFLICT DO NOTHING`, `@Modifying(flush/clear)`) → `FOR UPDATE` 행잠금 → 증가. `submission_no UNIQUE` 백스톱. **주의: 선삽입의 PC clear 때문에 호출자는 채번 이후 선행 로드 엔티티를 재접근하지 않는다.**

## 4. Batch 생성·취소·완료 — 검증·동시성

### 4.1 생성 (구현 완료)

트랜잭션 내: distinct·오름차순 정렬 → `findAllByIdInForUpdate` 행잠금(데드락 차단+직렬화) → all-or-nothing 검증(존재 404 → 동일 시설 400 → APPROVED 409 → 활성 item EXISTS 409) → 채번 → batch+items → audit `CREATED`.

### 4.2 취소 (구현 완료 · v2 가드 추가)

batch 조회(404) → **완료된 Batch 는 취소 불가(409 — 종결 상태, PR-3 에서 가드 추가)** → 기취소 409 → cancelledAt/cancelledBy → audit `CANCELLED`. booking·item 무변경.
PR-3 에서 batch 조회를 행잠금(`findByIdForUpdate`)으로 교체 — 완료/취소 동시 실행 레이스 차단(기존 이월 Minor 도 함께 해소).

### 4.3 완료 처리 (신규 — PR-3) — "학교 제출 완료"

담당자가 실제 학교 제출을 마친 시점에 Batch 를 완료 처리하면 포함 예약이 CONFIRMED 로 전이된다.

**동작(트랜잭션 내):**
1. batch **행잠금** 조회(404) → 기취소 409 → 기완료 409
2. item 의 bookingIds → `findAllByIdInForUpdate` 행잠금(정렬 — 생성과 동일 규칙)
3. **best-effort 전이**: `status == APPROVED` 인 예약만 `confirmManually(now)` 방식으로 CONFIRMED 전이 + `FacilityBookingStatusHistory` 기록(reason `"학교 제출 완료 — {submissionNo}"`, changed_by=관리자) + `FacilityBookingConfirmedEvent` 발행(기존 이벤트 재사용). 그 외 상태(CANCELLED·CONFLICT·기CONFIRMED)는 **스킵하고 결과에 나열**
3-근거. all-or-nothing 이면 검토 기간 중 한 건의 개별 취소·충돌 전이가 완료 처리를 영구 블록한다. 스킵 목록을 응답·감사로 투명하게 남기는 best-effort 가 운영 도구의 목적에 맞다. 기존 상태 머신과의 충돌 없음 — `confirmManually` 는 APPROVED 에서만 호출되고, 다른 상태는 전이 시도 자체를 하지 않는다.
4. `batch.complete(adminId, now)` → audit `COMPLETED` + **사람이 읽는 요약을 detail 에 기록**:

```
학교 제출 완료 — 총 10건 / 등록 완료 8건 / 제외 2건: 예약 #123(취소됨), 예약 #531(충돌)
```

제외 사유는 상태의 한글 라벨(취소됨/충돌/이미 등록 완료)로 기록한다 — ID 나열이 아니라 "왜 제외됐는지"가 남는 게 목적.
500자 초과 시 절단(절단 내장) — 요약 수치가 앞에 오므로 핵심 정보는 항상 보존된다. 제외 0건이면 `학교 제출 완료 — 총 8건 / 등록 완료 8건`.

**표현 단일 출처(v2.2 보완)**: 사유 라벨과 요약 문장 생성은 `SubmissionCompletionSummaryFormatter` 컴포넌트로 분리한다
(`reasonLabel(status)` + `summarize(total, confirmed, skipped)`) — 서비스는 호출만. 응답의 `reason` 과 감사 detail 이
같은 라벨을 쓰게 되어 FE 중복 매핑이 사라지고, 향후 문구·다국어 변경이 한 곳에 모인다.

**응답**: 200 — 운영자가 추가 조회 없이 결과를 안내할 수 있도록 전체·스킵 건수, **완료 시각, 사람이 읽는 제외 사유** 포함:

```json
{
  "totalCount": 10,
  "confirmedCount": 8,
  "skippedCount": 2,
  "completedAt": "2026-07-20T09:15:00",
  "skippedBookings": [ { "bookingId": 123, "status": "CANCELLED", "reason": "취소됨" } ]
}
```

완료된 Batch: CSV 재다운로드 허용(운영 기록), 취소 불가, 이력·상세에 "제출 완료" 배지.
candidates 파생 무영향 — submitted 판정은 `cancelledAt IS NULL` 만 보므로 완료 Batch 소속도 계속 "제출함"(포함 예약은 CONFIRMED 라 카드상 "학교 등록 완료"로 집계됨).

## 5. API

베이스 `/api/v1/admin/facility-bookings/submission`. 전부 ADMIN 전용(클래스 레벨 + URL 레이어 이중). 구현 완료 6종 + 신규 1종.

| API | 상태 | 핵심 |
|---|---|---|
| 5.1 GET `/candidates` | ✅ · **PR-3 확장** | 기간(≤31일) 필수. **v3: facilityId 는 옵션 — 생략 시 전 시설의 제출 후보 반환, 각 booking 에 `facilityId`/`facilityName` 포함(additive·하위호환)**. `{summary, bookings[]}` — 기간 내 전체(REJECTED 제외) + submitted/selectable 파생 + summary 4종(동일 필터 범위) |
| 5.2 POST | ✅ | `{bookingIds, memo?}` → 201 `{batchId, submissionNo, csvFileName}` |
| 5.3 GET (목록) | ✅ | 취소 포함 최신순 페이지네이션. **PR-3: `completed`/`completedAt` 필드 추가(additive)** |
| 5.4 GET `/{batchId}` | ✅ | 취소·완료 Batch 도 조회 가능. `{batch, bookings[]}`(멤버십 고정·status 현재값·활성 기준 재계산). audit `VIEWED`(쓰기 트랜잭션). **PR-3: batch 에 `completed`/`completedAt`, 응답에 `audits[]`(action·admin 이름·시각·IP) 추가** — 동아리별 그룹핑은 FE 가공 |
| 5.5 GET `/{batchId}/csv` | ✅ | Excel 호환(BOM·CRLF·수식 가드). 취소·완료 Batch 도 허용. audit `CSV_DOWNLOADED` |
| 5.6 DELETE `/{batchId}` | ✅ | 취소. 204 / 404 / 기취소 409. **PR-3: 기완료 409 가드 + 행잠금 추가** |
| 5.7 POST `/{batchId}/complete` | 🆕 PR-3 | §4.3. 200 `{totalCount, confirmedCount, skippedCount, completedAt, skippedBookings[{bookingId, status, reason}]}`. 404 / 기취소·기완료 409. audit `COMPLETED`+요약 detail(Formatter 단일 출처) |

## 6. Export — 선택 기능(업무 흐름의 일부가 아님)

CSV/PDF 는 업무 수행의 전제가 아니다. Batch 상세에서 필요할 때만 내려받는 부가 기능이다.
**Batch 생성 직후 자동 다운로드는 하지 않는다(v2)** — 생성 → 성공 토스트 → (필요 시) 상세에서 다운로드.

구조(구현 완료 — `service/export/`): `FacilitySubmissionExportService` → `SubmissionExportDataAssembler`(포맷 중립 조립) + Writer.

```
FacilitySubmissionExportService
├ CsvSubmissionWriter  (현재 구현)
└ PdfSubmissionWriter  (Future — 별도 스펙)
```

새 포맷 = Writer 1개 + ExportFormat enum 값 추가로 수용(포맷 2호 도입 시 contentType/파일명 매핑을 Writer 측으로 이동 — 합의된 이월). CSV 명세(14컬럼·BOM·CRLF·수식 인젝션 방지·한글 요일)는 구현 완료분 그대로.

## 7. 프론트엔드 (v3 — 단일 페이지 통합)

원칙: **"하나의 업무는 하나의 화면에서 끝난다."** 예약 승인 → 학교 제출 준비 → 제출 목록 관리가 페이지 이동 없이 이어진다. 도메인·API 는 무변경, UI/UX 재배치다.

### 7.0 구조 (PR-4a)

- 단일 페이지 `/admin/facility-bookings?tab=pending|prepare|batches` — 탭 3종 **[예약 관리 | 학교 제출 준비 | 제출 목록]**, 기본 pending. 탭 상태는 `useSearchParams` + `router.replace(scroll:false)`(ClubExplorePage 전례)로 URL 동기화 — 새로고침·뒤로가기·딥링크 보존. `useSearchParams` 는 Suspense 경계 필수(faq/page.tsx 전례 — fallback 은 RouteLoading).
- 구경로 `/admin/facility-bookings/submission` → `?tab=prepare` **서버 redirect**. Batch 상세 `/admin/facility-bookings/submission/[batchId]` 는 PR-4b 에서 신설·유지(딥링크).
- adminSections: "학교 제출" 항목 **제거**, "시설 예약 관리" 1항목(설명에 학교 제출 포함).
- 컴포넌트: `_pages/` 는 탭 셸만, 탭 내용은 `_tabs/BookingManagementTab`(기존 화면 이식)·`_tabs/SubmissionPrepareTab`(개편)·`_tabs/BatchesTab`(PR-4b — PR-4a 에선 "준비 중"). 기존 `submission/_components·_lib` 은 경로 유지·재사용.

### 7.1 예약 관리 탭 (PR-4a — 이식)

기존 AdminFacilityBookingsPage 내용 그대로(상태 카드·탭 필터·시설/기간 필터·큐 테이블·상세 모달·승인/반려/충돌/수동 확정 액션). **기능 변경 0** — 파일 이동과 명칭만.

### 7.2 학교 제출 준비 탭 (PR-4a — 개편)

자동 큐 UX: 진입 즉시 **전 시설 후보 조회**(candidates facilityId 생략 — §5.1 v3). 시설 선택 게이트 제거. 승인된 예약은 교차 무효화로 자동 유입.

- 상단(유지): 기간(기본 이번 달·31일 가드) + 동아리 검색 + 제출 상태 필터 + Summary 4카드(전 시설 합산·라벨 v2.2) + [목록|시간표] 토글
- 본문: **시설별 섹션**(시설명 오름차순) — 섹션 헤더 = 시설명 + "학교에 제출할 예약 N건", 섹션 안은 동아리별 그룹 목록(기존 컴포넌트 재사용). 시간표 모드에선 섹션별 시간표(기존 SubmissionTimetable — 단일 시설 단위 유지).
- **선택 모델 = 제외(excluded) 집합**: 화면의 제출 필요 예약은 **기본 전체 선택** — 선택 = selectable − excluded 로 파생. 체크 해제 = 제외(세션 내 비영속 — 영속 제외 플래그는 YAGNI), 재조회로 유입된 신규 승인 건은 자동 선택. 동아리 단위 일괄 해제/선택 유지.
- 섹션 액션: **"제출 목록 만들기 (N건)"** — 시설 단위(Batch 단일 시설 도메인 제약 그대로). N = 그 시설의 선택 건수, 0건이면 비활성.
- **Dialog(제출 목록 생성의 마지막 확인)**: 제목 `"{시설명} 예약 N건으로 제출 목록을 만들까요?"`, 본문 "선택한 예약으로 제출 목록을 만들어요. 학교 행정실 제출은 담당자가 직접 진행하며, 제출을 완료한 뒤 '제출 목록' 탭에서 '제출 완료' 처리를 해주세요." + memo(선택), 버튼 [취소 / **제출 목록 만들기**]. Batch 는 내부 개념으로만.
- 성공 토스트: "제출 목록이 만들어졌어요. 학교 제출 후 '제출 목록' 탭에서 완료 처리해 주세요." (자동 다운로드 없음 유지) → 해당 시설의 excluded 정리 + 후보 무효화(제출 필요→제출함 자동 반영).
- 로딩 LoadingGate·에러 role=alert+재시도·Empty("현재 학교에 제출할 예약이 없어요." vs 필터 결과 없음 구분)·반응형 유지.

### 7.3 제출 목록 탭 + Batch 상세 (PR-4b)

**제출 목록 탭**: 전체 Batch 페이지네이션 테이블 — 제출번호·시설·예약건수·생성일·생성자·메모 + **상태 배지 3종(검토 중/제출 완료/취소됨)**. Action(행): **학교 제출 완료 처리**(검토 중만)·CSV 다운로드·상세(라우팅)·취소(검토 중만).

**Batch 상세**(`/admin/facility-bookings/submission/[batchId]`): 운영 기록 화면. 헤더 = 제출번호·생성일·생성자·시설·포함 예약 수·메모·현재 상태 배지. 본문 = 동아리별 그룹 목록(읽기 전용) + 시간표 토글 + **Audit History**(action·관리자(탈퇴 시 이름 null 허용)·시각·요약 detail — COMPLETED 행은 요약 문구 그대로). Action = 완료 처리(검토 중만)·CSV·취소(검토 중만).

**완료 처리 UX(운영자 친화 문구 — 기술 용어 금지):**

- 확인 Dialog: "학교 제출을 완료하시겠습니까?" + 안내 3줄 — "• 제출 가능한 예약은 학교 등록 완료 상태로 변경됩니다. • 이미 취소되었거나 상태가 변경된 예약은 자동으로 제외됩니다. • 완료된 제출 목록은 다시 취소할 수 없습니다."
- 완료 후 안내: 스킵 0건이면 성공 토스트("학교 제출이 완료되었습니다."). **스킵이 있으면 결과 Dialog** — "학교 제출이 완료되었습니다. 총 10건 중 8건이 학교 등록 완료되었습니다. 2건은 상태가 변경되어 이번 제출에서 제외되었습니다." + 제외 목록(예약일·동아리·reason 라벨 — 응답의 reason 그대로, FE 재매핑 금지).

## 8. 보안 (불변 + complete 추가)

전 API ADMIN 전용(클래스 레벨 + `/api/v1/admin/**` URL 백스톱), complete 포함. all-or-nothing 생성 + 행잠금 직렬화. CSV 수식 인젝션 방지. Audit 5 이벤트(CREATED/CANCELLED/CSV_DOWNLOADED/VIEWED/**COMPLETED**)에 관리자·IP·UA — 목록 조회는 기록하지 않는다.

## 9. 테스트 계획

**구현 완료분(PR-1·FE Task 1~2)**: 유지 — BE 36개 + FE 계약·빌더 21개.

**PR-2 (FE)**: 그룹 목록(그룹핑·동아리 일괄 선택·부분 검색·제출 여부 필터), Summary 카드 라벨·필터 연동, 시간표(토글·선택), 생성 플로우(자동 다운로드 없음 — 토스트·무효화만), 기간 가드.

**PR-3 (BE 완료 처리)**: 완료 시 APPROVED 전이+history+이벤트 / 비APPROVED 스킵 목록(**reason 라벨 포함**) / **응답 정합(totalCount·confirmedCount·skippedCount·completedAt·skippedBookings)** / 기완료·기취소 409 / 완료 후 취소 409 / 완료·취소 동시 실행 행잠금 직렬화(실스레드) / candidates 파생 불변(완료 batch 도 제출함) / **SubmissionCompletionSummaryFormatter 순수 유닛(라벨 맵·0스킵·N스킵 형식)** / audit COMPLETED 요약 detail·500자 절단 / 상세 audits[] 응답.

**PR-4 (FE 이력·상세)**: 상태 배지 3종, 완료 확인 Dialog 안내 3줄 문구, **완료 결과 분기(스킵 0=토스트 / 스킵 있음=결과 Dialog+제외 목록)**, Export 버튼, Audit 표시(COMPLETED 요약 노출).

테스트 날짜는 상대 날짜(타임밤 금지), FE 는 훅 모듈 모킹.

## 10. PR 분할 (v3 재편)

1. ✅ **PR-1 (BE)**: V87+API 6종+Export+감사 — #682 머지 완료
2. ✅ **PR-2 (FE 제출 화면)**: #683 머지 완료 (+UI Copy 소PR — fix/facility-submission-ui-copy)
3. **PR-3 (BE 완료 처리 + candidates 확장)**: V88 + `POST /{batchId}/complete`(§4.3 — reason·completedAt·Formatter) + 취소 가드·행잠금 + 목록/상세 응답 확장(completed·audits[]) + **candidates facilityId 옵션화·facilityId/facilityName 응답 추가(§5.1 v3)** + FE 교차 무효화·타입 확장
4. **PR-4a (FE 통합 셸)**: `/admin/facility-bookings?tab=` 단일 페이지(탭 3종) + 예약 관리 탭 이식 + **학교 제출 준비 탭 개편**(시설별 섹션·기본 전체 선택·제외·"제출 목록 만들기" Dialog 재정의) + 구경로 리다이렉트
5. **PR-4b (FE 제출 목록 탭)**: Batch 이력(상태 배지 3종)·완료 처리(행+상세, 결과 분기 Dialog)·CSV·상세 화면(그룹·Audit 표시)

## 11. Future Roadmap

- **PDF Export** — 별도 스펙. Export 계층이 Writer 1개 + enum 값으로 수용(§6).

(v2 에서 제거: HWP 자동 생성·학교 메일 자동 발송·발송 이력·학교 시스템 연동 — 담당자 업무를 대체하지 않는다는 설계 원칙에 따름)
