# 회비 마감 임박 리마인더 (FEE_BILL_DUE_SOON) — 설계

## 배경 / 목표

현재 회비 알림은 발행(`FEE_BILL_ISSUED`)과 연체(`FEE_BILL_OVERDUE`) 둘뿐이다. 발행 이후
다음 알림이 곧장 "연체"라, 회원이 마감일을 깜빡하면 곧바로 연체자가 된다. 연체 전이 크론은
마감 *다음날* 00:10에 돌기 때문에 마감 당일에 알려줄 채널이 비어 있다.

마감 임박(D-3 / D-1 / D-0)에 미납 회원에게 인앱 리마인더를 보내 연체 발생률을 낮춘다.
기존 `DeadlineNotificationJob`(모집 마감 리마인더) 패턴을 그대로 재사용한다.

## 요구사항 (확정)

- 신규 Job: `FeeBillDueSoonReminderJob`
- 실행 시각: 매일 **06:00 KST** (`0 0 6 * * *`, zone `Asia/Seoul`)
- 활성화: `duing.fee.reminder.enabled=true` 일 때만 빈 등록 + 스케줄링 (기본 false)
- 대상: `due_date ∈ {오늘, 오늘+1, 오늘+3}` AND `status IN (PENDING, PARTIAL_PAID)`
- 알림 타입: `FEE_BILL_DUE_SOON` (NotificationType enum에 추가)
- dedupKey: `FEE_BILL_DUE_SOON:b={billId}:d={daysLeft}` — 오프셋별 1회
- 생성 방식: Job에서 `NotificationService.createIfAbsent` 직접 호출 (이벤트/리스너 추가 없음)
- 링크: `/me/fees?billId={billId}`
- payload: `{clubId, billId}`
- 제목: D-3 "회비 마감이 3일 남았어요" / D-1 "회비 마감이 1일 남았어요" / D-0 "오늘 회비 마감이에요"
- 본문: `{동아리명} · {회차명} · 마감 {dueDate}`

## 설계

### 흐름
1. `LocalDate today = LocalDate.now(clock)` → 대상 날짜 `[today, today+1, today+3]`
2. `feeBillRepository.findDueSoonUnpaidBills(dueDates)` 로 미납·마감임박 청구를 한 번에 조회 (전 동아리 글로벌 스윕 — `OverdueBillJob` 과 동일 결)
3. 각 행마다 `daysLeft = DAYS.between(today, dueDate)` (0/1/3) 계산 → 제목 분기, dedupKey 구성
4. `createIfAbsent` 직접 호출. 개별 실패는 `try/catch` 로 격리(배치 전체 중단 방지), 생성 건수 로깅

상태 전이가 없는 순수 알림이라 이벤트/리스너 없이 Job이 직접 호출한다(= `DeadlineNotificationJob` 과 동일, `OverdueBillJob` 처럼 상태 전이 + 이벤트가 필요 없음).

### Repository 조회 / Projection
회비 도메인의 기존 SELECT 프로젝션 스타일(`BillRecipient` JPQL 생성자 프로젝션)을 따른다.

- 신규 record `FeeBillDueSoonRow(Long billId, Long userId, Long clubId, String clubName, String billingPeriod, LocalDate dueDate)`
- JPQL: `FROM FeeBill b, Club c WHERE c.id = b.clubId AND b.status IN (PENDING, PARTIAL_PAID) AND b.dueDate IN :dueDates ORDER BY b.id`
- `FeeBill` · `Club` 모두 `@SQLRestriction("deleted_at IS NULL")` 보유 → soft-delete된 청구/폐쇄된 동아리는 자동 제외 (별도 deleted_at 조건 불필요)
- `daysLeft` 는 SQL 날짜연산(Postgres 종속) 대신 Job에서 `today` 기준 계산 → DB 비종속

### 멱등성
- dedupKey `FEE_BILL_DUE_SOON:b={billId}:d={daysLeft}` + `notification(user_id, dedup_key)` 유니크 제약
- 같은 날 재실행 → 동일 dedupKey 충돌 → `createIfAbsent` 가 false 반환(무시). 행 증가 없음
- D-3 / D-1 / D-0 은 daysLeft 가 달라 각각 별개 알림(같은 청구라도 최대 3번)

### 설정
- `application.yml` 의 `duing.fee` 아래 `reminder.enabled: ${DUING_FEE_REMINDER_ENABLED:false}` 추가
- `FeeReminderJobConfig`(@Configuration + @EnableScheduling + @ConditionalOnProperty) — `FeeJobConfig`/`FeeAutoIssueJobConfig` 와 동일 패턴
- prod yml 은 미수정 — 운영에서 `DUING_FEE_REMINDER_ENABLED=true` env 주입으로 활성화(overdue/auto-issue 와 동일 운영 방식)

### 마이그레이션 / 인덱스 영향
- **마이그레이션 불필요**: `NotificationType` 은 `VARCHAR(40)` STRING 저장 + DB CHECK 없음 → enum 값 추가만으로 충분
- **신규 인덱스 없음**: 조회 술어 `status IN (...) AND due_date IN (...)` 는 기존 `OverdueBillJob`(`status IN (...) AND due_date < today`)과 동일 비용 프로파일. `fee_bill` 인덱스는 `uk_fee_bill_idem`, `idx_fee_bill_club_status(club_id,status)`, `idx_fee_bill_user(user_id)` — 글로벌 스윕엔 모두 부적합하므로 seq scan(소규모 테이블, 1일 1회 비피크). due_date 인덱스 추가는 조기 최적화이며 OverdueBillJob 과 함께 별도로 다룰 사안 → 본 범위 제외

## Out of Scope (의도적 제외)

- 동아리별 알림 On/Off 설정 (글로벌 env 플래그만) — 별도 P2(알림 유형별 토글)에서 다룸
- 이메일/푸시(FCM) 채널 — 현재 인앱 알림만 존재
- D-2, D-7 등 추가 오프셋
- due_date 전용 인덱스 추가(성능 최적화)
- 연체(OVERDUE) 상태 청구 리마인더 — 미납이지만 이미 연체 알림을 받은 상태라 제외

## 테스트 (Testcontainers 통합)

`OverdueBillJobTest` 하니스 미러(`@SpringBootTest(properties="duing.fee.reminder.enabled=true")`, 실제 Clock 상대날짜).
- D-3 / D-1 / D-0 미납 청구에 알림 생성 + 제목/본문/dedupKey/링크/payload 검증
- D-2(비대상) / PAID / CANCELLED / OVERDUE 는 알림 미생성
- 재실행 멱등(2차에 행 증가 없음)
- 폐쇄(soft-delete)된 동아리 청구는 제외
- 한 회원의 여러 청구는 각각 알림
