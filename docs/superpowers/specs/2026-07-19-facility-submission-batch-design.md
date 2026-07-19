# 시설 예약 학교 제출 관리(Submission Batch) 설계

> 2026-07-19 · 승인된 설계. 시설 예약 승인(APPROVED) 이후 "학교 행정실 제출" 업무 자체를 관리하는 기능.
> 기존 예약 상태 머신(PENDING→APPROVED→CONFIRMED 외 REJECTED/CONFLICT/CANCELLED)은 **일절 변경하지 않는다**.
> Submission 은 booking 을 스칼라 ID 로만 참조하는 **독립 Aggregate** 다.

## 1. 개요

현재 프로세스: 학생 신청(PENDING) → 총동연 승인(APPROVED) → **학교 행정실 제출(관리 안 됨)** → 학교 등록(CONFIRMED).
이 스펙은 굵은 구간을 Submission Batch 로 관리한다: 제출 대상 조회 → Batch 생성 → CSV 다운로드 → 이력/상세 → 취소 → Audit.

"제출됨"은 booking 의 상태가 아니다. **활성 Batch(cancelledAt IS NULL)에 속한 item 존재 여부로 파생**된다.
Batch 취소 시 booking 은 건드리지 않는다 — item 이 비활성화되며 자연히 제출 대기로 복귀한다
(이미 CONFIRMED 된 booking 은 후보 조건에 안 걸리므로 복귀하지 않음 — 의도된 동작).

### Scope — 현재 구현 / 향후 확장

**현재 구현**
- CSV Export

**향후 확장 (별도 스펙으로 진행, 이번 구현 없음)**
- HWP 신청서 생성
- PDF Export
- 학교 담당자 메일 발송
- 학교 시스템 연동

이번 구현 범위는 CSV 뿐이지만, Export 계층(§6)은 HWP/PDF 까지 Writer 추가만으로 확장 가능한 구조로 설계한다.

### Out of Scope

- 제출 후 CONFIRMED 자동 전환
- 알림(제출/취소 알림) 연동
- REJECTED 예약의 시간표 표시 (운영 노이즈 — 후보 응답에서 제외)
- RN 앱 화면
- 기존 관리자 승인 큐 화면 변경

## 2. 백엔드 — 도메인 모델 & DB (V87)

새 도메인 패키지 `domain/facilitysubmission/` (api/controller/service/repository/entity/exception 표준 구조).
booking·facility·user 는 전부 스칼라 ID 참조 (facilitybooking 관례 동일).

### V87__create_facility_submission_tables.sql — 테이블 4개

**facility_submission_batch**
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | |
| submission_no | VARCHAR(20) NOT NULL UNIQUE | `SUB-YYYYMMDD-NNN` |
| facility_id | BIGINT NOT NULL | 스칼라 참조. Batch = 단일 시설 |
| submitted_by | BIGINT NOT NULL | 관리자 user id |
| submitted_at | TIMESTAMPTZ NOT NULL | |
| memo | VARCHAR(500) NULL | |
| csv_file_name | VARCHAR(100) NOT NULL | 생성 시점에 `facility-submission-{submissionNo}.csv` 확정 저장 |
| cancelled_at | TIMESTAMPTZ NULL | **soft delete 아님 — 비즈니스 상태.** `@SQLRestriction` 미적용(취소돼도 이력에 계속 표시) |
| cancelled_by | BIGINT NULL | |
| created_at / updated_at | | BaseEntity. deletedAt 은 사용하지 않음 |

**facility_submission_item**
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | |
| batch_id | BIGINT NOT NULL FK→batch | |
| booking_id | BIGINT NOT NULL | 스칼라 참조 |

- item 은 batch 에 완전 종속 — **자체 cancelled_at 없음**. `batch.cancelledAt != null` 이면 item 도 비활성으로 간주.
- 이 결정의 파급: booking_id 부분 유니크 인덱스를 걸 수 없다(인덱스는 batch 상태를 참조 못 함).
  **중복 제출 방지는 애플리케이션 레벨에서 보장한다** — §4 참조. 조회 인덱스 `idx_facility_submission_item_booking (booking_id)` 는 둔다.

**facility_submission_seq** — 채번 전용
| 컬럼 | 타입 |
|---|---|
| seq_date | DATE PK |
| next_value | INT NOT NULL |

**facility_submission_audit** — append-only (수정/삭제 메서드 없음, auth_event 전례)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | BIGSERIAL PK | |
| batch_id | BIGINT NOT NULL | 대상 Batch |
| action | VARCHAR(20) NOT NULL | enum: `CREATED / CANCELLED / CSV_DOWNLOADED / VIEWED` |
| admin_id | BIGINT NOT NULL | |
| ip_address | VARCHAR(45) NULL | `getRemoteAddr()` 인라인 관례 |
| user_agent | VARCHAR(500) NULL | `AuthTextTruncator` 로 절단 (auth_event 관례) |
| created_at | TIMESTAMPTZ NOT NULL | |

Audit 기록 이벤트는 위 4개뿐이다. **목록 조회는 기록하지 않는다.**

## 3. submissionNo 채번

- 형식 `SUB-YYYYMMDD-NNN` (NNN = 일별 3자리, 001부터). 날짜는 seoulClock 기준 제출일.
- 절차(트랜잭션 내): `INSERT INTO facility_submission_seq (seq_date, next_value) VALUES (오늘, 1) ON CONFLICT DO NOTHING` → `SELECT ... WHERE seq_date = 오늘 FOR UPDATE` → 현재값 사용·`next_value + 1` 갱신.
  행잠금으로 동시 요청 직렬화, `submission_no UNIQUE` 가 최종 백스톱.
- 실스레드 동시성 테스트(ExecutorService+latch 전례)로 중복 0 을 증명한다.

## 4. Batch 생성 — 검증·동시성

`POST` 트랜잭션 내 순서:

1. bookingIds 비어있으면 400. 중복 ID 제거.
2. **bookingIds 를 오름차순 정렬 후 `FOR UPDATE` 로 행잠금** (정렬 = 상호 데드락 방지. `findAllByIdForUpdate` 신규).
3. 검증 — **all-or-nothing**: 하나라도 실패하면 Batch 를 만들지 않고 예외.
   - 존재하지 않는/삭제된 booking → 404 계열
   - 전부 동일 facility 인지 (facilityId 는 booking 에서 유도) → 아니면 400
   - `status == APPROVED` 아님 → 409 `SubmissionBookingNotApprovedException`
   - 활성 item 존재(이미 제출) → 409 `SubmissionBookingAlreadySubmittedException`
     — 활성 판정: `EXISTS (item JOIN batch WHERE booking_id = ? AND batch.cancelled_at IS NULL)`
     — booking 행잠금 하에서 검증하므로 동시 생성 레이스에서 한쪽만 성공
4. 채번(§3) → batch + items insert → audit `CREATED`.

정상 경로에선 UI 가 selectable 만 선택시키므로 3의 409 는 동시 작업 레이스에서만 발생한다.

취소(`DELETE`): batch 조회(없으면 404) → 이미 취소면 409 → `cancelledAt/cancelledBy` 세팅 → audit `CANCELLED`. booking·item 무변경.

## 5. API — 6 엔드포인트

베이스 `/api/v1/admin/facility-bookings/submission`. 클래스 레벨 `@PreAuthorize("hasRole('ADMIN')")`.
Api 인터페이스(`AdminFacilitySubmissionApi`) + Controller 분리, DTO 는 record (레포 관례).

### 5.1 GET `/candidates` — 제출 대상/현황 조회

파라미터: `facilityId`(필수), `startDate`/`endDate`(필수, 기간 ≤ 31일 아니면 400), `clubId`(옵션).
페이지네이션 없음(시간표는 기간 전체 필요, 31일 상한이 안전판).

응답 — **summary 와 bookings 명확 분리**:

```json
{
  "summary": {
    "approvedCount": 0,        // status=APPROVED (필터 범위 내)
    "awaitingCount": 0,        // APPROVED && 미제출
    "submittedCount": 0,       // 활성 Batch 에 묶인 예약 수
    "confirmedCount": 0        // status=CONFIRMED
  },
  "bookings": [ {
    "bookingId": 1, "clubId": 1, "clubName": "...",
    "applicantName": "...",    // UserRepository 일괄 조회 (booking 은 applicantId 만 보유)
    "contactPhone": "...",     // 빈 문자열은 blankToNull (V85 하위호환 관례)
    "reservationDate": "2026-08-01", "startTime": "18:00", "endTime": "21:00",
    "purpose": "...", "attendeeCount": 30,
    "status": "APPROVED",      // REJECTED 는 응답에서 제외
    "submitted": false,        // 활성 item 존재 여부
    "selectable": true,        // status==APPROVED && !submitted
    "submissionNo": null,      // 제출된 경우 소속 Batch 번호
    "decidedByName": "...", "decidedAt": "..."   // 승인자/승인일시
  } ]
}
```

summary 는 bookings 와 동일 필터 범위에서 계산한다(카드 클릭=필터 연동 일관성).

### 5.2 POST — Batch 생성

Body `{ "bookingIds": [1,2], "memo": "..." }` → §4 → 201 `{ "batchId": 1, "submissionNo": "SUB-20260801-001", "csvFileName": "facility-submission-SUB-20260801-001.csv" }`

### 5.3 GET — 제출 이력 (페이지네이션)

`?page&size(기본 20)&facilityId(옵션)`. **취소된 Batch 포함** 최신순. 행: submissionNo, facilityName, bookingCount, submittedAt, submittedByName, memo, cancelled(bool), cancelledAt.

### 5.4 GET `/{batchId}` — 상세

취소된 Batch 도 조회 가능. 응답: batch 헤더(이력 행과 동일 + memo·csvFileName) + `bookings[]`(5.1 과 동일 형태 — 멤버십은 Batch 기준 고정, status 는 현재값 노출 → 제출 후 취소된 예약도 운영자가 식별).
audit `VIEWED` 기록. **⚠️ 감사 기록이 있는 조회이므로 서비스 메서드에 readOnly 트랜잭션 금지** (readOnly×쓰기 오케스트레이션 실PG 500 함정).

### 5.5 GET `/{batchId}/csv` — CSV 다운로드

취소된 Batch 도 허용(이력 확인용 — FE 가 취소됨 맥락 표시). audit `CSV_DOWNLOADED`.
응답: `text/csv;charset=UTF-8`, `Content-Disposition: attachment; filename*=UTF-8''...` (FederationInquiry 다운로드 전례).

### 5.6 DELETE `/{batchId}` — 제출 취소

§4 취소 절차. 204. 미존재 404 / 기취소 409.

## 6. Export 계층 — SubmissionExportService

CSV 생성을 Controller/도메인 Service 에 넣지 않고 별도 계층으로 분리한다 (향후 PDF/Excel/공문 확장 대비 — 지금은 CSV 만 구현).

- `service/export/SubmissionExportService` — 진입점. `export(batchId, ExportFormat.CSV) → ExportFile(fileName, contentType, byte[])`
- `service/export/SubmissionExportDataAssembler` — Batch+booking+시설/동아리/유저 이름을 모아 포맷 중립 `SubmissionExportData` 조립
- `service/export/CsvSubmissionWriter` — `SubmissionExportData → byte[]`
- `ExportFormat` enum: 현재 `CSV` 하나

```
SubmissionExportService
├ CsvSubmissionWriter  (현재 구현)
├ HwpSubmissionWriter  (Future — 학교 제공 신청서 템플릿)
└ PdfSubmissionWriter  (Future)
```

CSV 는 첫 번째 Writer 구현체다. 새 포맷은 **Writer 1개 + ExportFormat enum 값 추가**만으로 수용한다
(Service·Assembler 는 무변경 — 데이터 조립이 포맷 중립이므로). 실제 HWP/PDF 구현은 이번 스펙에서 하지 않는다.

### CSV 명세

- 컬럼 14개 (순서 고정): 제출번호, 시설명, 예약일, 요일(한글 월~일), 예약 시작시간, 예약 종료시간, 동아리명, 신청자, 연락처, 사용인원, 사용목적, 승인자, 승인일시, 비고(=batch memo)
- **UTF-8 BOM**(EF BB BF) + **CRLF** 개행, 필드 이스케이프(쌍따옴표), **수식 인젝션 방지**(`= + - @ 탭` 선행 시 `'` 전치 — FE membersCsv 규칙을 BE 로 이식)
- 데이터 기준: **Batch 생성 당시 멤버십**(items). 값은 현재 booking 데이터로 렌더(승인자·승인일시는 불변이라 실질 동일)
- 파일명: batch.csvFileName (`facility-submission-{submissionNo}.csv`)

## 7. 프론트엔드

메뉴: `adminSections.ts` 에 "학교 제출" 1줄 추가 (`href: /admin/facility-bookings/submission`, group '동아리').

### 라우트 2개

- `/admin/facility-bookings/submission` — 단일 페이지, **탭 [제출 대기 | 제출 이력]** (페이지 분리 아님 — 하나의 업무)
- `/admin/facility-bookings/submission/[batchId]` — Batch 상세

### 제출 대기 탭

위→아래: 시설 Dropdown(`useFacilityUsageQuery` 재사용, 시설 단위 진행) → 기간 필터(`input type=date` 2개, 기본 이번 달) + 동아리 필터 → **Summary 카드 4개**(승인 완료/제출 대기/학교 제출 완료/학교 등록 완료 — `BookingSummaryCards` 의 aria-pressed 클릭=필터 패턴) → **[시간표 보기|목록 보기] 토글**(기본 시간표) → 선택 후 우측 상단 `제출 Batch 생성` 버튼.

**시간표(신규 `SubmissionTimetable`)** — FullCalendar 금지, `WeekTimetable` 의 병합 계획(buildColumnPlan) 로직을 전치 재사용:
- 세로 = 예약 날짜(기간 내 예약 있는 날짜만), 가로 = 시간 09~22 (13칸), 예약 = **colSpan 병합 Block**
- Block 표시: 동아리명 + 예약시간 + 사용인원(없으면 사용목적) — Tooltip 없이 식별 가능하게
- Hover: 경량 커스텀 Tooltip 신규 1개(시설명·신청자·연락처·목적·인원·승인자·승인일) / 클릭: 우측 Drawer(`ui/sheet.tsx` side="right") 상세
- 색상 맵: PENDING 회색 · selectable(미제출 APPROVED) Primary Blue · 제출완료 Green · CONFIRMED 진초록+"등록완료" · CANCELLED Red 소거 톤 · CONFLICT coral "충돌"
- **선택 모델: 클릭(탭) 토글 + Ctrl/⌘ 다중 + "전체 선택/해제" 버튼. Shift 범위선택 없음.** 모바일 = 탭 토글 + 전체 선택. selectable=false 블록은 선택 불가(시각적 비활성)
- 모바일: `overflow-x-auto` 가로 스크롤, 날짜 열 sticky

**목록 보기**: 체크박스 테이블(admin 첫 다중선택 — select-all/indeterminate 신규), 컬럼 = 시설·예약일·시간·동아리·신청자·목적·인원·승인일. 시간표와 동일 데이터·동일 선택 상태 공유.

**Batch 생성 플로우**: 버튼 → Dialog "총 N건의 예약을 하나의 학교 제출 Batch로 생성합니다. 계속하시겠습니까?" (+memo 입력) → POST → 성공 시 CSV 자동 다운로드(응답 batchId 로 `/csv` 호출 → Blob 저장) → Toast "학교 제출 Batch가 생성되었습니다." → candidates·이력 쿼리 무효화.

### 제출 이력 탭

페이지네이션 테이블: 제출번호·시설·예약건수·제출일·제출자·메모 + **취소됨 배지**. Action: 상세(라우팅)·CSV 다운로드·제출 취소(확인 Dialog → DELETE → 무효화).

### Batch 상세 페이지

상단 헤더(제출번호·시설명·건수·제출자·제출일·메모·취소됨 배지) + 시간표 View 와 목록 View **동시 표시**(제출 내용 직관 확인). 읽기 전용(선택 없음) — `SubmissionTimetable` 을 selection 비활성 모드로 재사용. Action: CSV 재다운로드·제출 취소.
Future Action(이번 구현 없음): HWP 생성·학교 메일 발송 — 상세 화면 Action 영역에 버튼이 추가되는 형태로 확장 예정.

### API 클라이언트·훅

- `client.admin.facilityBookings.submission.{candidates, create, list, detail, csv, cancel}` — csv 는 `Blob` 반환, 저장은 blob 다운로드 헬퍼(기존 `downloadTextFile` 옆에 Blob 버전 소확장)
- 훅 `packages/hooks/src/facilitySubmissionAdmin.ts`: `useSubmissionCandidatesQuery / useSubmissionListQuery / useSubmissionDetailQuery / useCreateSubmissionBatchMutation / useCancelSubmissionBatchMutation` + `adminQueryKeys` 확장, 뮤테이션 `onSettled` 무효화 관례

### UX 공통

- 로딩: 전체 영역 `LoadingGate`, 버튼 `ButtonSpinner`(CSV 다운로드 중 포함), 컨벤션 준수(텍스트 로딩 금지)
- Empty: 필터 결과 없음 vs 데이터 없음 구분 문구(NoticeEmptyState 패턴), 에러는 `role="alert"`+재시도
- 필터·탭·선택 상태는 클라 상태로 유지(탭 전환 시 보존). Desktop 우선 반응형

## 8. 보안

- 전 API ADMIN 전용(클래스 레벨), batchId 접근도 ADMIN 한정이라 IDOR 면 최소 — 존재하지 않는 batchId 는 404
- 이미 제출된 예약 포함 Batch 생성 불가(§4 all-or-nothing + 행잠금 직렬화)
- CSV 수식 인젝션 방지, 파일명은 서버 확정값 사용
- Audit 4 이벤트에 관리자·IP·UA·대상·시각 기록

## 9. 테스트 계획

**BE**
- 채번: 실스레드 동시 N건 → submissionNo 중복 0·연속성
- 중복 제출: 같은 booking 으로 동시 2 Batch → 1 성공·1 `AlreadySubmitted` (행잠금 증명)
- all-or-nothing: 부적격 1건 섞이면 Batch/item/채번 미생성(롤백)
- 취소→재제출 가능, 기취소 409, 미존재 404
- candidates: submitted/selectable 파생 정확성(취소된 Batch 는 미제출 취급), REJECTED 제외, summary 4값, 기간 31일 초과 400
- CSV: BOM 선두 바이트, CRLF, 쌍따옴표 이스케이프, 수식 인젝션 전치, 요일 한글, 14컬럼 순서
- audit: 4 이벤트 기록·목록 조회 미기록, UA 절단
- 권한: 비ADMIN 403

**FE**
- 시간표 병합 계획(colSpan·연속 시간 병합·색상 맵) 유닛
- 선택 모델(토글·전체 선택·selectable=false 차단)
- 생성 플로우 msw: Dialog→POST→CSV Blob 다운로드 호출→toast→무효화
- 이력 취소됨 배지·취소 플로우, 상세 읽기 전용

**테스트 날짜는 상대 날짜 사용(하드코딩 미래 절대날짜 금지 — CI 시한폭탄 방지).**

## 10. PR 분할 (모두 develop 기준, Subagent-Driven)

1. **PR-1 (BE)**: V87 + facilitysubmission 도메인 전체(API 6종·Export 계층·audit) + 테스트
2. **PR-2 (FE)**: 학교 제출 페이지 — 탭 셸 + 제출 대기 탭(시설선택·Summary·시간표/목록·선택·Batch 생성·CSV 자동 다운로드) + 메뉴 추가. 이력 탭 자리는 "준비 중" 플레이스홀더
3. **PR-3 (FE)**: 제출 이력 탭 실장 + Batch 상세 페이지(재다운로드·취소)

## 11. Future Roadmap

Submission Batch 는 단순 CSV 출력 기능이 아니라 **학교 제출 업무 자동화를 위한 기반 도메인**이다.
향후 다음 기능을 각각 별도 스펙으로 구현한다.

- 학교 제공 HWP 신청서 템플릿 자동 생성
- PDF Export
- 학교 담당자 이메일 자동 발송
- 발송 이력 관리
- 학교 행정 시스템 연동(선택)

본 스펙에서는 이를 구현하지 않으며, Submission Batch 도메인과 Export 계층이
해당 기능을 수용할 수 있는 구조만 제공한다(포맷 중립 ExportData·Writer 확장·append-only audit).
