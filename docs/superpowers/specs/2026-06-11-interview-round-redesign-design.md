# Interview Scheduling 재설계 — Round 중심 · AFTER_SCREENING · Slot-Picking

> 작성: 2026-06-11 · 상태: 사용자 리뷰 대기
> 근거: 작업 지시 v2 + 브레인스토밍 섹션 1~3 승인분 (수정사항 전부 반영)

## 1. 배경 & 문제

현재 면접은 **AT_APPLICATION + 슬롯 사전생성** 모델이다 (지원 시 슬롯 선택 → 평가 → 선정 → 자동배정). 결함 3가지:

1. **Availability 수집이 너무 이르다** — 6/1 지원 → 6/25 선정이면 지원 시점의 가능시간이 무효화된다.
2. **정기모집도 슬롯 수 예측 불가** — 실제 면접 대상자 수를 모른 채 슬롯을 미리 만들어야 한다.
3. **지원이 슬롯에 묶여 있다** — 운영진이 슬롯을 깜박하면 지원 폼 자체가 안 열린다.

본질은 "상시모집 불가"가 아니라 **Availability 수집 시점이 이르고, 지원이 면접 세팅에 결합돼 있다**는 것.

## 2. 목표 모델 & Benefits

면접의 중심을 **Recruitment → InterviewRound** 로 이동. **AFTER_SCREENING + Slot-Picking**:

```
지원 → (모집마감/누적) → 평가 → 면접 대상 선정
  → InterviewRound 생성 → 슬롯 생성(대상자 수 확인 후) → Availability 요청(알림)
  → 대상자가 슬롯 선택 → 자동배정(draft) → 운영진 검토 → 확정 → 면접
```

정기/상시모집이 **동일 도메인**을 쓴다. 차이는 Round 생성 시점과 운영 UI뿐 (정기 = 모집마감 후, 상시 = 운영진이 대기 인원 보고 수동 오픈).

**Benefits:**
- 지원 시점에 슬롯/availability가 불필요 → **지원 흐름과 면접 세팅이 디커플링**. 운영진이 면접 관리를 깜박해도 지원은 정상 작동 (결함 3 제거).
- Availability는 대상 선정 직후 수집 → 시점 문제 해소 (결함 1 제거).
- 슬롯은 대상자 수 확인 후 생성 → 예측 불요 (결함 2 제거).

## 3. 현재 상태 검증 (2026-06-11 코드 기준)

스펙 v2의 가정은 전부 확인됨. 추가 발견:

- 최신 마이그레이션 = `V48` → 신규는 **V49**. V46에 soft delete 대응 partial unique index 전례, V38에 상태 조건 partial unique 전례.
- `InterviewMatchingService`가 그리디 매칭을 순수 함수로 이미 구현 — 비교자만 수정해 재사용.
- `INTERVIEW_REMINDER` + `InterviewReminderJob` 존재 — round 기준으로 재배선 필요.
- 프론트는 config 중심으로 상당 부분 구현돼 있음 (`InterviewManagementPage`, `SlotPatternForm`, dry-run, `ApplicationStepper`, `EditAvailabilityModal`) — 신규 작성이 아니라 round 중심 재배선.
- `interview_schedule.application_id`가 전역 UNIQUE → per-round partial unique로 완화 필요.
- `Application`에 `@Version` 낙관적 락 + 상태이력 기록 + ACCEPTED 시 클럽멤버 자동등록 존재 — wizard 일괄 전이가 이 경로를 그대로 탄다.
- AT_APPLICATION 결합 지점: `GeneralApplicationService.submit()` → `createAllInSubmission()`, `SubmitApplicationRequest.interviewSlotIds`, FE `ApplyInterviewSlotsStep.tsx`.

## 4. 데이터 모델 (Flyway V49, drop & recreate)

출시 전 · 운영 데이터 없음 전제. 구 4테이블(`interview_config`, `interview_slot`, `interview_availability`, `interview_schedule`) DROP 후 신규 5테이블 생성. 기존 V45~48 파일은 수정하지 않는다. V45가 만든 `uk_application_id_recruitment_id`는 무해하므로 유지.

```sql
interview_round
  id                       BIGSERIAL PK
  recruitment_id           BIGINT NOT NULL REFERENCES recruitment(id) ON DELETE RESTRICT
  title                    VARCHAR(100) NOT NULL
  status                   VARCHAR(20) NOT NULL
                           -- DRAFT | COLLECTING | ASSIGNING | SCHEDULED | CANCELLED
  availability_deadline    TIMESTAMPTZ NULL      -- DRAFT 동안 nullable, 발송 전이 시 NOT NULL 가드
  location                 VARCHAR(200) NULL
  assignment_completed_at  TIMESTAMPTZ NULL      -- 확정 시각
  request_sequence         INT NOT NULL DEFAULT 0
  -- request_sequence: MVP 는 Availability 요청/재알림 dedupKey 생성용.
  -- 향후 NotificationLog/InterviewRoundNotification 테이블로 이관 가능.
  + BaseEntity (created_at / updated_at / deleted_at)
  INDEX (recruitment_id, status)
  PARTIAL UNIQUE (recruitment_id) WHERE status = 'DRAFT' AND deleted_at IS NULL
  -- 모집당 DRAFT round 최대 1개 (V38 패턴)

interview_round_member
  id                             BIGSERIAL PK
  round_id                       BIGINT NOT NULL REFERENCES interview_round(id)
  application_id                 BIGINT NOT NULL REFERENCES application(id)
  status                         VARCHAR(30) NOT NULL
                                 -- INVITED | RESPONDED | NO_AVAILABLE_SLOT | ASSIGNED | EXCLUDED
  alternative_availability_text  VARCHAR(500) NULL   -- NO_AVAILABLE_SLOT 시 자유텍스트
  UNIQUE (round_id, application_id)
  -- 일반 unique: 멤버는 soft delete 하지 않고 EXCLUDED 로 종결 → FK 타겟으로 사용 가능

interview_slot
  id          BIGSERIAL PK
  round_id    BIGINT NOT NULL REFERENCES interview_round(id)
  start_time  TIMESTAMPTZ NOT NULL
  end_time    TIMESTAMPTZ NOT NULL
  capacity    INT NOT NULL CHECK (capacity > 0)
  CHECK (end_time > start_time)
  UNIQUE (id, round_id)                  -- composite FK 타겟 (V45 패턴 유지)
  INDEX (round_id, start_time)

interview_availability
  id, round_id, application_id, slot_id
  FK (slot_id, round_id)        → interview_slot(id, round_id)            -- 슬롯-라운드 정합
  FK (round_id, application_id) → interview_round_member(round_id, application_id)
                                                                          -- 멤버만 응답 가능
  PARTIAL UNIQUE (application_id, slot_id) WHERE deleted_at IS NULL       -- V46 패턴

interview_schedule
  id, round_id, application_id, slot_id
  status       VARCHAR(20) NOT NULL CHECK (status IN ('ASSIGNED','CANCELLED'))
  assigned_at  TIMESTAMPTZ NOT NULL
  FK (slot_id, round_id)        → interview_slot(id, round_id)
  FK (round_id, application_id) → interview_round_member(round_id, application_id)
  PARTIAL UNIQUE (round_id, application_id) WHERE deleted_at IS NULL
  -- 자동배정 재실행 시 soft delete 후 재생성 허용. 전역 UNIQUE 였던 application_id 는 per-round 로 완화
  -- status='CANCELLED' 은 MVP 미사용 (재배정은 soft delete 경로).
  -- future 재면접 (ASSIGNED member → EXCLUDED + schedule CANCELLED) 용 예약값.
```

모든 테이블에 BaseEntity 공통 컬럼(`created_at`/`updated_at`/`deleted_at`) 포함, `@SQLDelete` + `@SQLRestriction` soft delete (기존 패턴). 단 `interview_round_member` 는 soft delete 를 사용하지 않고 `EXCLUDED` 상태로 종결한다 (FK 타겟 unique 유지 목적 — 컬럼은 두되 삭제 경로 없음).

`interview_config` 는 삭제 — 필드 전부 `interview_round` 로 이동. `recruitment.use_interview` 플래그만 잔존.

## 5. 상태머신

### 5.1 Round

```
DRAFT ──[발송: 슬롯≥1 && 멤버≥1 && deadline≠null + 알림]──▶ COLLECTING
COLLECTING ──[자동배정 실행]──▶ ASSIGNING ──[확정]──▶ SCHEDULED (터미널)
DRAFT | COLLECTING | ASSIGNING ──[취소]──▶ CANCELLED (터미널)
```

- `SCHEDULED` 는 round 의 종결 상태 (member 의 `ASSIGNED` 와 이름 충돌 제거). 향후 `COMPLETED` 확장 여지.
- `ASSIGNING → COLLECTING` 복귀 없음 (YAGNI). 재수집이 필요하면 CANCELLED 후 새 round.
- **재면접/노쇼는 MVP 미지원** — SCHEDULED 는 터미널이며 이후 변경 불가. 운영진이 application 합불(ACCEPTED/REJECTED)로 직접 처리한다. (확장 시 ASSIGNED member → EXCLUDED + schedule CANCELLED 한 줄로 추가 가능)
- `assignment_completed_at` = 확정 시각 기록.

### 5.2 RoundMember

```
INVITED ──응답(슬롯선택)──▶ RESPONDED            ←─┐ COLLECTING && 마감 전 재응답으로
INVITED ──응답(가능없음)──▶ NO_AVAILABLE_SLOT    ←─┘ 상호 전환 가능
NO_AVAILABLE_SLOT ──[COLLECTING && 마감 전 추가 슬롯 생성]──▶ INVITED 자동복귀 + 재알림 (Rule 2)
RESPONDED ──[확정]──▶ ASSIGNED                       (schedule 보유자만)
INVITED | RESPONDED | NO_AVAILABLE_SLOT ──[운영진 제외 / 강제확정]──▶ EXCLUDED
```

### 5.3 파생 규칙 (저장하지 않는 상태)

- **미응답**: `member.status == INVITED && now > round.availability_deadline` 로 파생 표시. `NO_RESPONSE` 저장 안 함.
- **면접 대기열(상시)**: `application.status == INTERVIEW_PENDING && placement-active 멤버십 없음` 파생 쿼리 (5.4절 `isActiveForPlacement`). 별도 저장 안 함.
- `now` 는 도메인 내부에서 `LocalDateTime.now()` 를 호출하지 않고 서비스 레이어가 주입한다 (결정성·테스트 용이성 — 기존 `InterviewConfig` 패턴 유지).

### 5.4 멤버십 술어 2종 (불변식 — "active" 단독 단어 금지)

```
isActiveForPlacement(member)   // 배치·중복방지용 — DRAFT 포함
  = round.status ∈ {DRAFT, COLLECTING, ASSIGNING, SCHEDULED} && member.status != EXCLUDED

isVisibleToApplicant(member)   // 지원자 노출(phase)용 — DRAFT 제외
  = round.status ∈ {COLLECTING, ASSIGNING, SCHEDULED} && member.status != EXCLUDED
```

- **placement 사용처**: 후보 조회(API 1), round 생성 검증(API 2), "placement-active 멤버십 최대 1개" 불변식, 대기열 파생.
- **visible 사용처**: applicantPhase 파생(9.3절) 단독.
- 코드에서 `active` 단독 이름 금지, 두 술어 혼용 금지. 용도 차이(DRAFT 가 배치엔 포함·노출엔 제외)를 주석으로 명시한다.
- **placement 에 SCHEDULED 포함이 핵심**: 제외하면 면접 일정이 잡힌 지원자가 대기열에 재등장해 더블부킹된다. 대기열 이탈은 application.status(ACCEPTED/REJECTED)로 처리한다.
- `EXCLUDED` 멤버는 round 상태와 무관하게 두 술어 모두 false → **즉시 대기열 복귀** → 새 round 재수용 가능.
- 한 application 은 placement-active 멤버십 최대 1개. 재도전은 이전 round 가 CANCELLED 된 뒤 (또는 EXCLUDED 처리된 뒤) 새 round 에서.

### 5.5 NO_AVAILABLE_SLOT 정책 (불변식)

- **Rule 1**: `NO_AVAILABLE_SLOT` 멤버는 자동배정 대상이 아니다. `alternativeAvailabilityText` 는 비구조 텍스트라 매칭에 안 들어가고 수동 처리 전용.
- **Rule 2**: 추가 슬롯 생성 시 자동으로 `NO_AVAILABLE_SLOT → INVITED` 복귀 + 재알림. **적용 범위 = COLLECTING && 마감 전**. 마감 후엔 [마감 연장] 먼저. ASSIGNING 중 슬롯 추가는 수동 배정용이라 복귀 없음.

### 5.6 No-response 정책

- 자동배정 대상 = `RESPONDED` 멤버만.
- 마감 후 `INVITED` 잔존 = 미응답 → 운영진 목록 노출, 수동 처리 (개별 배정 / EXCLUDED / 마감 연장 / 재알림).
- 자동 연장·자동 제외는 만들지 않는다 (YAGNI).

## 6. 자동배정 & 확정

### 6.1 그리디 (기존 `InterviewMatchingService` 재사용, 비교자 수정)

- **멤버 처리 순서**: 가용 슬롯 수가 적은(제약 큰) 멤버 먼저. tie → applicationId.
- **슬롯 선택**: 본인이 고른 슬롯 중 **capacity 잔여 최대** (`capacity - assigned`). tie → start_time, slot_id.
- 최적 매칭 안 함.

### 6.2 draft semantics

- 자동배정 실행 = `COLLECTING → ASSIGNING` 전이 + RESPONDED 멤버 매칭 + `interview_schedule` 생성.
- **draft 여부는 `round.status == ASSIGNING` 으로 표현** — schedule 에 DRAFT status 를 추가하지 않는다. 멤버는 RESPONDED 유지.
- ASSIGNING 재실행 = 기존 schedule soft delete 후 재생성. 수동 수정 = schedule 개별 교체 (capacity 하드 체크).

### 6.3 확정 (경고 2종 분리)

- `force` 없는 확정 요청에 미처리 멤버가 있으면 409 + 내역을 **2종으로 분리** 반환:
  - (a) 미응답(INVITED·마감경과 파생) / NO_AVAILABLE_SLOT
  - (b) **RESPONDED 인데 슬롯 만석으로 미배정** — 별도 강조 (응답했는데 누락되는 케이스)
- 409 body:

```json
{
  "code": "INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS",
  "unresponded":         [{ "applicationId": 1, "applicantName": "…", "memberStatus": "INVITED|NO_AVAILABLE_SLOT" }],
  "respondedUnassigned": [{ "applicationId": 2, "applicantName": "…", "selectedSlotIds": [3, 5] }]
}
```

  - `unresponded` = (a) INVITED(마감경과)·NO_AVAILABLE_SLOT — `memberStatus` 로 세분 렌더 가능.
  - `respondedUnassigned` = (b) 강조 대상. FE 는 (b)를 시각 강조 + [추가 슬롯 생성]/[수동 배정]/[force 확정] 액션 제공.
- `force=true` → 한 트랜잭션: 잔존 미처리 멤버 자동 EXCLUDED → schedule 보유 멤버 ASSIGNED 전이 → round SCHEDULED → `INTERVIEW_SCHEDULED` 알림 발화 (AFTER_COMMIT 리스너).
- 멤버 ASSIGNED 전이와 알림은 **확정 시점에만** 발화. EXCLUDED 된 지원자는 application 이 INTERVIEW_PENDING 그대로라 대기열 복귀.

## 7. 동시성

- **Round 생성/멤버 추가**: application 행 `PESSIMISTIC_WRITE` 잠금 후 "placement-active 멤버십 없음"(`isActiveForPlacement`) 검증 — 두 운영진이 동시에 같은 지원자를 다른 round 에 넣는 race 차단.
- **Application 상태 전이**: 기존 `@Version` 낙관적 락 + flush 변환(409) 경로 그대로 사용.
- **Round 상태 전이**: `InterviewRound` 에 `@Version` 낙관적 락 (Application 전례와 일관) — 자동배정/확정/취소 race 차단. 전이 메서드는 도메인 내부에서 현재 상태를 검증하고 위반 시 도메인 예외.
- **모집당 DRAFT 1개**: DB partial unique 로 강제 (4절).

## 8. 알림

- **신규 `NotificationType.INTERVIEW_AVAILABILITY_REQUESTED`** — event 발행 + AFTER_COMMIT 리스너 + `createIfAbsent` (기존 패턴).
  - dedupKey: `INTERVIEW_AVAILABILITY_REQUESTED:r={roundId}:a={applicationId}:q={requestSequence}`
  - 발송·재알림·**Rule 2 재초대** 모두 직전에 `round.request_sequence++`. 안 올리면 직전 발송과 dedupKey 가 같아져 재알림이 deduped 되어 소실된다. (sequence 는 round 단위 monotonic, dedupKey 에 applicationId 가 포함되어 대상자별 분리)
- **확정 시 기존 `INTERVIEW_SCHEDULED` 재사용** (dedupKey `a={applicationId}:s={slotId}` 유지).
- `INTERVIEW_REMINDER` + `InterviewReminderJob` 유지 — location 을 round 에서 join 하도록 수정.
- `INTERVIEW_UPDATED` / `INTERVIEW_CANCELLED` 타입·리스너는 **보존하되 MVP 발행 경로 없음** (SCHEDULED 터미널이므로 — 다리 안 태움).

## 9. API 설계

URL 컨벤션: `/api/v1` 베이스, 리소스 중첩 + 액션 kebab-case (기존 `auto-assign` 전례). **운영진 엔드포인트는 `/leader/` prefix + 인터페이스 명명 `Leader{Domain}Api`** — application 도메인의 living convention 정렬 (BE#2 리뷰 반영; 삭제된 구 인터뷰 도메인의 `Manager*`/무prefix 전례는 따르지 않는다). 운영진 API 권한 = `clubAuthService.requireManager`, 지원자 API = 본인 application 검증 (기존 패턴). Swagger `api/` 인터페이스 → `controller/` 구현 순서 준수.

### 9.1 운영진

| # | Method & Path | 계약 |
|---|---|---|
| 1 | `GET /leader/recruitments/{recruitmentId}/interview-round-candidates` | **기본 후보군 = 큐** (`INTERVIEW_PENDING && placement-active 멤버십 없음`). `includeUnderReview=true` 필터로 UNDER_REVIEW 포함. 정기 wizard 는 `true` 기본 전송(메인 플로우가 UNDER_REVIEW 선정), 상시 dashboard 대기열 카운트는 큐만 집계. |
| 2 | `POST /leader/recruitments/{recruitmentId}/interview-rounds` | `{title, availabilityDeadline?, location?, applicationIds[]}` → round DRAFT + members 생성. **허용 상태: UNDER_REVIEW(→INTERVIEW_PENDING 전이), INTERVIEW_PENDING(유지). 그 외(SUBMITTED/ACCEPTED/REJECTED) 포함 시 거부.** 한 트랜잭션, application 행 PESSIMISTIC_WRITE 후 placement-active 검증. |
| 3 | `GET /leader/recruitments/{recruitmentId}/interview-rounds` · `GET /leader/interview-rounds/{roundId}` | 목록 / 상세 dashboard (멤버별 상태, 응답·미응답·가능슬롯없음 카운트 — 미응답은 마감경과 파생, QueryDSL). |
| 4 | `POST /leader/interview-rounds/{roundId}/slots` (일괄) · `PATCH/DELETE /leader/interview-slots/{slotId}` | 일괄생성(클라이언트가 패턴→리스트 변환, capacity 필수)·수정·삭제. **phase 가드: 슬롯 변경은 DRAFT·COLLECTING 에서만, ASSIGNING/SCHEDULED 불가** (기존 `SlotMutableFields.NONE`). **삭제: availability 참조 > 0 → 409** (기존 `canDeleteSlot` 일치). **시간변경: availability 참조 > 0 이면 불가, capacity 만 수정 가능** (기존 `CAPACITY_ONLY` port). COLLECTING && 마감 전 추가 생성 시 Rule 2 발동. |
| 5 | `POST /leader/interview-rounds/{roundId}/request-availability` | **발송**: `require(슬롯≥1 && 멤버≥1 && deadline≠null)` → DRAFT→COLLECTING, `request_sequence++`, INVITED 전원 알림. |
| 6 | `POST /leader/interview-rounds/{roundId}/remind` | **재알림**: COLLECTING 한정, INVITED(미응답) 대상, `request_sequence++`. |
| 7 | `PATCH /leader/interview-rounds/{roundId}` | title/location/deadline 수정. deadline 연장은 DRAFT·COLLECTING 에서만. |
| 8 | `POST /leader/interview-rounds/{roundId}/auto-assign` | **허용 상태: COLLECTING, ASSIGNING.** COLLECTING → ASSIGNING 전이 후 배정 / ASSIGNING 재실행 시 기존 draft schedule soft delete 후 재생성. |
| 9 | `PUT/DELETE /leader/interview-rounds/{roundId}/members/{memberId}/schedule` | 수동 배정·재배정(capacity 하드 체크) / 배정 해제. ASSIGNING 한정, NO_AVAILABLE_SLOT 멤버 포함 가능. |
| 10 | `POST /leader/interview-rounds/{roundId}/members/{memberId}/exclude` | EXCLUDED 전이 (즉시 대기열 복귀). |
| 11 | `POST /leader/interview-rounds/{roundId}/confirm` | 6.3 절 계약 (`force` + 경고 2종 분리 409). |
| 12 | `POST /leader/interview-rounds/{roundId}/cancel` | DRAFT·COLLECTING·ASSIGNING 에서만. 멤버 재큐잉 (application status 롤백 없음 — INTERVIEW_PENDING 유지). SCHEDULED 는 터미널. |

### 9.2 지원자

| # | Method & Path | 계약 |
|---|---|---|
| 13 | `GET /applications/{applicationId}/interview` | **서버 파생 `applicantPhase` enum 만 반환. raw member/round status 미노출 (SSOT).** COLLECTING 이면 슬롯 목록+내 선택+마감 포함, SCHEDULED 면 확정 일정(`round.location`) 포함. |
| 14 | `PUT /applications/{applicationId}/interview-availability` | 응답 upsert: `{slotIds[]}` **또는** `{noAvailableSlot: true, alternativeText}`. COLLECTING && 마감 전 한정, 재응답 가능. |

### 9.3 applicantPhase 파생 (서버 단독 — SSOT)

FE 는 applicantPhase 만 소비한다. status→phase 파생은 서버 단독, **FE 재파생 금지** (EXCLUDED 누출 원천 차단). **평가 순서**:

```
0) application.status 가 표 밖(SUBMITTED/ACCEPTED/REJECTED)이면 visible 여부와 무관하게
   NOT_APPLICABLE — 합불 처리 후 잔존한 visible 멤버십이 AVAILABILITY_* 등을 노출하면 안 된다
   (BE#7 리뷰 반영: COLLECTING 중 REJECTED 처리된 지원자가 응답 화면을 계속 받는 구멍 차단)
1) isVisibleToApplicant 유무 먼저 (5.4절 — DRAFT 제외)
   visible = round.status ∈ {COLLECTING,ASSIGNING,SCHEDULED} && member ≠ EXCLUDED
   ※ DRAFT 멤버는 visible=false → 2번 분기 → WAITING_ROUND
2) visible 없음 →
   - application UNDER_REVIEW                   → DOCUMENT_REVIEW    "서류 검토 중"
   - INTERVIEW_PENDING && 참여 이력 없음          → WAITING_ROUND      "면접 회차 배정 대기 중"
   - 참여 이력 있음 && visible 없음(EXCLUDED/CANCELLED)
                                                → WAITING_NEXT_ROUND "다음 면접 회차 안내 대기 중"
3) visible 있음 → round.status + member.status 조합:
   - INVITED && COLLECTING && now < deadline    → AVAILABILITY_REQUESTED "면접 가능 시간을 선택해주세요" + 마감 D-day
   - INVITED && COLLECTING && now ≥ deadline    → AVAILABILITY_CLOSED    "응답 기간이 마감되었습니다 — 운영진 처리 대기"
   - RESPONDED && COLLECTING                    → RESPONDED              "응답 완료 — 일정 확정을 기다리는 중"
   - NO_AVAILABLE_SLOT                          → NO_SLOT_REPORTED       "가능한 시간이 없다고 응답했어요 — 운영진이 조율 중"
   - round ASSIGNING                            → SCHEDULING             "면접 일정 조율 중"
   - ASSIGNED && round SCHEDULED                → SCHEDULED              "면접 일정 확정" + 일시·장소
```

- **DRAFT 멤버십의 노출 처리**: `isVisibleToApplicant` 가 DRAFT 를 제외하므로 DRAFT 멤버는 2번 분기로 표시되고, round 가 DRAFT 인 동안 지원자는 조회/응답 불가. 배치·중복방지는 `isActiveForPlacement`(DRAFT 포함)가 담당 — 두 술어 혼용 금지(5.4절).
- **참여 이력 정의**: CANCELLED round 의 멤버십 또는 **비DRAFT round 의** EXCLUDED 멤버십이 존재하면 "이력 있음". 진행 중인 DRAFT 멤버십만 있는 경우는 물론, **DRAFT round 안에서의 EXCLUDED 도 이력이 아니다** — 발송 전 라운드는 지원자에게 존재한 적이 없으므로 그 안의 제외가 phase 변화(WAITING_NEXT_ROUND)로 새면 DRAFT 비노출 원칙 위반이다 (BE#7 리뷰 반영).
- **마감 경계 표기 통일**: 표의 마감 비교는 §5.3 과 동일하게 strict — `now > deadline` 이면 CLOSED/미응답, `now == deadline` 정각은 아직 REQUESTED (구현: `now.isAfter(deadline)`).
- **경계**: 이 표는 평가~면접 구간만 커버. SUBMITTED(평가 전)·ACCEPTED·REJECTED(최종 합불)는 interview 표 밖 — application 결과 뷰가 담당.
- **내부 상태(EXCLUDED 등)를 "제외" 같은 부정 신호로 노출 금지.** 내부 상태 ≠ 노출 문구.

## 10. 프론트 구조

### 10.1 데이터 레이어 (packages)

- `packages/types/src/interview.ts` · `packages/schemas/src/interview.ts` — Round/RoundMember/상태 union/applicantPhase 로 재작성.
- `packages/api` — 백엔드 Swagger 에서 `generated/schema.d.ts` 재생성 (BE PR 머지 후 해당 FE PR 에서 갱신).
- `packages/hooks` — `interviewQueryKeys.ts` round 중심 재작성: `['interview-rounds', recruitmentId]` / `['interview-round', roundId]` / `['interview-round-candidates', recruitmentId]` / `['my-interview', applicationId]`.
- **invalidation 규칙**: 제외/확정/**취소** 모두 → 해당 round 키 + `interview-round-candidates`(대기열) 키 invalidate (cancel 도 멤버 재큐잉하므로 포함).

### 10.2 라우트

```
manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/
├── page.tsx           라운드 목록 + 대기열 섹션 (상시: 큐 카운트 + [Round 생성])
├── rounds/new/        wizard (Step1 대상선정 → Step2 Round정보 → Step3 슬롯 → Step4 검토·발송)
└── rounds/[roundId]/  라운드 dashboard
```

### 10.3 Wizard / DRAFT lifecycle

- **모집당 DRAFT round 최대 1개** (DB 강제). wizard 진입 시 기존 DRAFT 감지 → **이어하기 / 폐기 선택 (둘 다 UI 노출)**. 폐기 = DRAFT cancel (멤버 재큐잉).
- **Step1 = ephemeral** (커밋 0, 안전 구역 — 후보 선택만).
- **Step2 완료 시 `POST rounds` = 첫 persist + UNDER_REVIEW→INTERVIEW_PENDING 전이 커밋** — 부수효과를 UI 에 명시한다.
- Step3 슬롯 일괄생성 (`SlotPatternForm`·`generateSlotsFromPattern`·`SlotPreviewList` 재사용, **capacity 입력 필수**).
- Step4 발송 — 버튼 활성화 조건 `슬롯≥1 && 멤버≥1 && deadline≠null` (서버 가드와 1:1).
- **Step1 후보 필터 UX**: 진입 맥락별 기본값 + 토글.
  - 정기 wizard 진입 = `includeUnderReview=true` 기본 → "서류 검토 중" + "면접 대기열" 둘 다 노출, 그룹 헤더로 구분.
  - 상시 대기열 진입 = `false` 기본 → 대기열만, 토글로 UNDER_REVIEW 포함 가능.
  - 후보 행에 상태 뱃지(서류 검토 중 / 면접 대기) + 선택 카운터 + 일괄 선택.

### 10.4 라운드 dashboard

상태 배너(round status + 단일 next action) / 카운트 카드(응답완료·미응답·가능슬롯없음) / 멤버 테이블(파생 미응답 표시) / **NO_AVAILABLE_SLOT 전용 섹션** (alternativeText 노출 + [추가 슬롯 생성][제외]) / 슬롯 섹션 / 자동배정 검토 영역 (draft 배지, [확정] 모달 경고 2종 분리, [수동 수정] = 기존 `AssignToSlotModal` 재사용) / [재알림] [마감 연장] [취소].

### 10.5 진행단계 표시 (가드레일 UI)

`deriveInterviewStep.ts` 를 round 기반으로 재작성:

```
모집중 → 평가(미평가 N건 뱃지) → [round 없음] 면접 대상 선정 → DRAFT: 슬롯·발송
  → COLLECTING: 응답 대기(n/N) → ASSIGNING: 배정 검토 → SCHEDULED: 면접 진행 → 합불 처리
```

모집 카드/상세에 현재 단계 + 단일 next action 버튼. 순서 가드레일은 전부 서버 전이 규칙과 1:1 (발송=슬롯≥1·멤버≥1·deadline, 자동배정=RESPONDED≥1, 확정=경고 2종 모달).

### 10.6 제거 / 재배선

- 제거: `ApplyInterviewSlotsStep`, `InterviewConfigSection`, `PromoteToInterviewPendingDialog` (wizard 가 대체).
- 재배선: `ApplicationStepper`·`deriveStepperSubState`(applicantPhase 소비), `EditAvailabilityModal`(round 응답), `ApplicantInterviewScheduleCard`, 알림 타입 매핑(`INTERVIEW_AVAILABILITY_REQUESTED`).

## 11. 테스트 전략

- **BE**: 도메인 단위 (Round/Member 상태머신 전이표, 매칭 비교자, Rule 2 복귀, `now` 주입 결정성) + RestAssured 통합 (TestContainers — 권한·상태 가드·409·동시성 시나리오). Fixture Monkey / `common/fixture/`. `@DisplayName` 은 요구사항 문장.
- **풀 시나리오 통합 테스트** (BE#11): 생성→슬롯→발송→응답→자동배정→확정→알림 dedup 검증.
- **더블부킹 회귀 테스트 필수**: "SCHEDULED round 소속 지원자는 candidates/queue 에 안 뜬다" 통합 테스트 (`isActiveForPlacement` 정의 회귀 방지).
- **FE**: vitest+RTL 기존 패턴 미러 — util 단위(`deriveInterviewStep`, phase→copy 매핑), 컴포넌트(wizard 단계 가드, 확정 모달 경고 2종, NO_AVAILABLE_SLOT 섹션), hooks(invalidation).
  - **"EXCLUDED 가 부정 문구로 렌더되지 않는다"** 단정 테스트.
  - **"AVAILABILITY_CLOSED 는 선택 UI 비활성"** 단정 테스트.

## 12. PR 분해 & 리뷰 정책

`develop` 분기 → `develop` PR. Conventional Commits (`feat(backend):` 등). 1 API(또는 1 페이지) = 1 브랜치 = 1 PR. V49 는 slot/availability/schedule 을 recruitment 기준 → round 기준으로 repoint(drop & recreate)하므로 **마이그레이션과 구 interview 도메인 제거는 원자적** — 분리하면 기동/컴파일 실패. 떼어낼 수 있는 것은 submit 결합뿐.

```
BE#0  feat(backend): 지원 시 슬롯 제출 제거 (SubmitApplicationRequest.interviewSlotIds)
      — 구 스키마 유지·독립적, FE#1 과 짝, 먼저 머지
BE#1  refactor(backend): V49 스키마 전환 + 신규 엔티티/enum/레포 5종 + 구 interview 도메인 제거
      + ReminderJob round 기반 재작성 + GeneralApplicationService 조회 경로 수정 + 테스트 정리
      ※ repoint 불가분 — 이 PR 동안 면접 기능 비활성 (출시 전 허용, PR 본문에 명시)
BE#2  feat(backend): 라운드 후보 조회 (API 1)
BE#3  feat(backend): 라운드 생성 wizard (API 2)
BE#4  feat(backend): 슬롯 CRUD + Rule 2 + 알림 인프라 INTERVIEW_AVAILABILITY_REQUESTED (API 4)
      — 발송/재알림(BE#5)이 알림 인프라에 의존 → BE#4 가 BE#5 에 선행
BE#5  feat(backend): 발송/재알림 (API 5, 6)
BE#6  feat(backend): 라운드 목록/상세 dashboard (API 3)
BE#7  feat(backend): 지원자 인터뷰 조회 (API 13)
BE#8  feat(backend): 지원자 응답 PUT (API 14)
BE#9  feat(backend): 자동배정 (API 8)
BE#10 feat(backend): 수동 배정/해제/제외 (API 9, 10)
BE#11 feat(backend): 확정 (API 11) + 풀 시나리오 통합 테스트
BE#12 feat(backend): 취소 + 라운드 수정 (API 7, 12)

FE#1  apply 흐름 슬롯 스텝 제거 (BE#0 짝)
FE#2  선정→슬롯→발송 wizard
FE#3  라운드 dashboard
FE#4  지원자 응답 UI·stepper 재배선 (applicantPhase 소비)
FE#5  상시 대기열 dashboard + 모집 카드 단계표시
```

**리뷰**: 모든 PR — `duing-code-reviewer` + `codex:review` 기본. **BE#1(Migration·데이터무결성)·BE#3·BE#9·BE#10·BE#11(상태전이·동시성·권한) — `codex:adversarial-review` 필수.** PR 본문: 🚀/🤔/💬, 클래스명 나열 금지. Co-Authored-By/Generated 라인 금지.

## 13. 제거 대상 / 유지

**제거:**
- AT_APPLICATION 경로 전체 — `SubmitApplicationRequest.interviewSlotIds`, `createAllInSubmission`, `ApplicantInterviewSlotApi`, 구 `InterviewAvailabilityApi`·`InterviewScheduleApi`, `ManagerInterviewConfigApi`, `ManagerInterviewScheduleApi`(신규 API 로 대체), `InterviewConfig` 엔티티·테이블, FE `ApplyInterviewSlotsStep`.

**유지·수정:**
- `InterviewMatchingService` (비교자만 수정), `InterviewReminderJob` (round join), `GeneralApplicationService` 면접 조회 헬퍼 (round 기반 재작성), `INTERVIEW_SCHEDULED`/`INTERVIEW_REMINDER` 알림, `recruitment.use_interview` 플래그.
- Round 모델은 일반적으로 설계 — 미래 `AvailabilityType { SLOT_SELECTION, TIME_RANGE }` 확장 및 AT_APPLICATION 재도입 여지를 남긴다 (다리 태우지 말 것).

## 14. Out of Scope (MVP 에서 만들지 않음)

- When2meet 식 자유 시간범위 (`TIME_RANGE`) / AT_APPLICATION 타이밍 재도입
- 자동 배치 트리거 (누적 인원·cron 기반 round 자동 생성)
- 범용 채용 ATS / 최적 매칭 (헝가리안 등)
- 자동 마감연장·자동제외
- **재면접/노쇼 처리** — SCHEDULED 터미널, 운영진이 application 합불로 직접 처리
- 확정(SCHEDULED) 후 일정 변경·취소 — `INTERVIEW_UPDATED/CANCELLED` 발행 경로 없음 (타입은 보존)
- `ASSIGNING → COLLECTING` 복귀
- 운영진 대상 알림 (미응답 알림 등 — dashboard 노출로 갈음)
- NotificationLog / InterviewRoundNotification 테이블 (`request_sequence` 로 갈음, 향후 이관 가능)
- **알림 전달 보장(outbox/재시도)** — 인앱 알림은 best-effort 보조 채널이다 (BE#11 adversarial 리뷰 판정: AFTER_COMMIT 리스너의 REQUIRES_NEW 실패 시 해당 멤버 알림은 유실되지만, SSOT 인 지원자 조회 API 가 phase·일시·장소를 항상 표시하고 dedupKey 가 중복만 막는다 — 유실 윈도우는 "메인 TX 커밋 직후 알림 insert 실패"라는 좁은 DB 장애 케이스라 MVP 수용)
- **INTERVIEW_PENDING 되돌리기 미지원** — round 투입 후(취소·EXCLUDED 포함)에도 application 은 INTERVIEW_PENDING 유지 (UNDER_REVIEW 롤백 없음). 일방통행이며 정리는 ACCEPTED/REJECTED 로만. 정기모집 no-response 잔존은 운영진 수동 REJECT.

## 15. 핵심 결정 로그

| # | 결정 | 근거 |
|---|---|---|
| 1 | Round 에 DRAFT 상태 추가 | 발송 전 상태 표현, wizard 이어하기, 발송 가드를 서버 전이 규칙으로 강제 |
| 2 | 확정 시 경고 후 강제 + 잔존 미처리 자동 EXCLUDED | 운영 피로 최소화, round 깔끔 종결, EXCLUDED→대기열 복귀로 손실 없음 |
| 3 | 코어 전환 PR(BE#1) + API 별 PR, BE#0 선분리 | repoint 불가분, 출시 전이라 면접 기능 일시 비활성 허용 |
| 4 | round 종결 상태 ASSIGNED → SCHEDULED rename | member.ASSIGNED 와 충돌 제거, COMPLETED 확장 여지 |
| 5 | placement-active 정의에 SCHEDULED 포함 | 더블부킹 방지 — 대기열 이탈은 application 합불로 |
| 6 | applicantPhase 서버 단독 파생 (SSOT) | EXCLUDED 등 내부 상태 누출 원천 차단 |
| 7 | draft 배정을 round.status 로 표현 (schedule 에 DRAFT 없음) | 상태 중복 제거, 스키마 단순화 |
| 8 | 멤버십 술어 2개 분리 (isActiveForPlacement / isVisibleToApplicant) | DRAFT 가 배치엔 포함·노출엔 제외 — 혼용 시 더블부킹/조기노출 버그 |
| 9 | 운영진 라운드 API 는 `/leader/` prefix + `Leader*` 명명 | 구 인터뷰 도메인(Manager*, 무prefix)이 아닌 living convention(application 도메인) 정렬 — BE#2 리뷰 반영 |

## 16. 후속 PR 데이터 무결성 요구사항 (BE#1 adversarial 리뷰 반영)

"placement-active 멤버십 최대 1개" 불변식은 cross-table 술어라 DB 로 표현할 수 없고 서비스 레벨로 강제한다(§7). BE#1 의 reader 들은 이 불변식을 신뢰하므로, **불변식을 만들거나 깨뜨릴 수 있는 각 writer PR 은 아래를 필수 요구사항으로 상속한다**:

1. **BE#11 (확정)**: 확정은 멤버 `ASSIGNED` 전이의 유일한 지점 — 한 application 의 활성(ASSIGNED·미삭제) schedule 이 **전 라운드 통틀어 1개**임을 placement 불변식이 보장한다. 확정 트랜잭션은 이를 전제로 검증한다.
2. **BE#12 (취소)**: round `CANCELLED` 전이 시 **해당 라운드의 활성 schedule 전부 soft delete**. 누락 시 취소된 라운드의 draft 배정이 새 라운드 배정과 병존해 `findByApplicationId`(Optional)·`findAssignedSlotByApplicationId`(fetchOne)·`ApplicationRepositoryImpl` join 이 깨진다.
3. **BE#10 (제외)**: ASSIGNING 중 멤버 `EXCLUDED` 전이 시 **해당 멤버의 활성 schedule soft delete**. 누락 시 제외된 지원자에게 `InterviewReminderJob` 이 리마인더를 발송하고 상세 화면에 배정이 잔존한다.
4. **round 삭제 경로 금지**: 라운드 종결은 `CANCELLED`/`SCHEDULED` 상태 전이뿐 — soft delete 포함 삭제 API 를 만들지 않는다. round 가 soft delete 되면 자식(slot/schedule)은 활성인데 `@SQLRestriction` 이 부모를 숨겨 location 소실·리마인더 무음 스킵이 발생한다.
5. **member 삭제 경로 금지**: `InterviewRoundMemberRepository` 의 상속 `delete*` 는 호출 금지 (hard delete — soft delete 미설정이 의도, §4). 종결은 `EXCLUDED` 전이뿐. BE#3 에서 멤버 쓰기 도입 시 가드(또는 금지 테스트) 권장.
6. **Optional reader 의 loud-failure 는 의도**: `findVisibleToApplicantRoundByApplicationId`·`findByApplicationId`·`findAssignedSlotByApplicationId` 가 불변식 위반 데이터를 만나면 `NonUniqueResult` 로 시끄럽게 실패한다 — silent LIMIT 1 으로 오염을 가리지 않는 선택이며, 위 1~3 요구사항이 지켜지면 도달하지 않는다.
7-1. **슬롯 변경과 응답의 직렬화 (BE#4 리뷰 반영, BE#8 이행 완료)**: 슬롯 시간변경·삭제의 "선택 참조 0" 검증은 read-check-then-write 라서, 응답 API(BE#8)가 availability 를 삽입할 때 **대상 슬롯 행 잠금** 으로 직렬화한다. **단, 직렬화는 양쪽이 잠가야 완성된다** (BE#8 adversarial 리뷰 반영): 슬롯 시간변경·삭제 측도 참조 검사 **전에** 같은 슬롯 행을 `PESSIMISTIC_WRITE` 로 잠근다 — 한쪽만 잠그면 "참조 0 확인 → 응답 커밋 → 삭제" 순서로 활성 응답이 삭제된 슬롯을 참조하게 된다.
7-1-a. **수용된 잔여 윈도우 (pre-lock ABA, BE#8 adversarial 리뷰 판정)**: 지원자가 슬롯 목록을 본 시점과 제출 시점 사이에 **참조 0 슬롯**의 시간이 변경되면, 제출은 변경 후 시간 기준으로 저장된다. 참조>0 시간변경은 409 로 차단되므로 이미 선택한 응답의 시간은 불변이고, 이 윈도우는 "아직 제출하지 않은 화면"에만 영향한다 — 확정 알림(슬롯 시간 포함)이 최종 시간의 SSOT 이므로 MVP 는 수용한다. expectedStartTime 류 낙관적 토큰 계약은 도입하지 않는다. FE#4 응답 화면은 제출 성공 후 재조회로 최신 시간을 표시한다.
7-2. **멤버 행 잠금 (BE#8 adversarial 리뷰 반영)**: `interview_round_member` 는 `@Version` 이 없으므로, **같은 멤버 행의 상태를 쓰는 경로가 둘 이상 동시에 존재하면 반드시 행 잠금(`PESSIMISTIC_WRITE`)으로 직렬화한다**. BE#8 시점의 동시 writer 쌍은 응답(markResponded/reportNoAvailableSlot)과 Rule 2 재초대(reinviteAfterSlotAdded) — 잠금 없이는 "INVITED 인데 활성 응답 보유" lost update 가 가능했다. 응답은 멤버 재로드를 잠금 조회로, 재초대는 대상 멤버 조회를 잠금 조회로 수행한다. **후속 멤버 상태 writer(BE#9 배정·BE#10 수동 배정/제외·BE#11 확정)도 멤버 행을 잠그고 전이한다.** application FORCE_INCREMENT(§16-7)는 멤버십 생성/배치 정합용이고, 멤버 행 잠금은 같은 멤버 행의 동시 쓰기용 — 둘은 보완 관계다.
7-4. **전역 잠금 순서 (BE#9 adversarial 감사로 확정)**: 복수 비관 잠금을 잡는 모든 TX 는 자원 순서 **application(id asc) → round → slot(id asc) → member(id asc)** 를 따른다 — 실측: 응답 = application→slot→member, 자동배정 = round→slot→member, Rule 2 = member 단독, 슬롯 변경 = slot 단독, 라운드 생성 = application 단독. BE#8 초기 구현이 member→slot 역순이라 자동배정과 교착 사이클이 실재했고 재배치로 해소했다. **후속 PR(BE#10 수동배정·BE#11 확정·BE#12 취소)의 잠금도 이 순서를 따른다** — 특히 확정(round→member 예상)과 수동배정(round→slot→member 예상)은 표에 안전하다.
7-3. **수용된 잔여 윈도우 (경계 응답, BE#9 설계 판정)**: 응답 TX 가 기간 검사(COLLECTING)를 통과한 직후 자동배정이 전이·배정·커밋하면, 그 마지막 순간 응답 1건은 draft 에 미반영될 수 있다. availability·RESPONDED 데이터는 일관하므로 모순이 아니며, ASSIGNING 재실행과 확정 게이트(§6.3 respondedUnassigned)가 노출·흡수한다 — 응답 측 round 공유 잠금 도입은 과설계로 보류. ASSIGNING 진입 후 응답은 기존대로 409.
7. **멤버십 writer 와 상태 전이 writer 의 직렬화 (BE#3 adversarial 리뷰 반영)**: 멤버십을 만들거나 바꾸는 writer 는 대상 application 을 `PESSIMISTIC_FORCE_INCREMENT` 로 잠가 **전이가 없는 후보(INTERVIEW_PENDING 재수용 등)도 version 을 강제 증가**시킨다 — 잠금 없이 `@Version` 만 쓰는 `updateStatus` 류 동시 쓰기가 커밋 시 낙관적 충돌(409)로 떨어져 "합격 처리된 지원자가 활성 멤버십 보유" 불일치를 차단한다. FORCE_INCREMENT 경합의 패자는 `PessimisticLockingFailureException` 으로 표면화되며 전역 핸들러가 409 로 변환한다. 후속 멤버십 writer(BE#10 제외 등)도 동일 규칙을 따른다.
