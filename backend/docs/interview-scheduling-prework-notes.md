# 면접 스케줄링 기능 사전 확인 (Pre-work Notes)

Task 0: spec §10 의 사전 확인 4건. **사실 조사 결과만** 담는다 — 후속 결정·규칙은 plan / spec 이 책임진다.

작성일: 2026-06-08

> 본 메모는 후속 Task 1~11 작업자들이 동일한 사실 위에서 작업하도록 하기 위한 reference 다. **적용 규칙·아키텍처 결정은 본 메모가 아니라 [plan 문서](../../docs/superpowers/plans/2026-06-08-interview-scheduling.md) 와 [spec 문서](../../docs/superpowers/specs/2026-06-08-interview-scheduling-design.md) 를 따른다.**

---

## 1. 시간 타입 — 코드 사실

| 필드 | 타입 |
|------|------|
| `Recruitment.startDate` | `java.time.LocalDate` |
| `Recruitment.endDate` | `java.time.LocalDate` |
| `Recruitment.interviewStartDate` | `java.time.LocalDate` |
| `Recruitment.interviewEndDate` | `java.time.LocalDate` |
| `Application.interviewAt` | `java.time.LocalDateTime` |

`Recruitment` 도메인은 `LocalDate` (날짜 단위), `Application.interviewAt` 는 `LocalDateTime` (분 단위) 를 사용. 본 코드베이스 기존 패턴은 **LocalDate / LocalDateTime 혼용**.

신규 `interview/` 도메인의 시간 컬럼 — `interview_config.availability_deadline`, `interview_slot.start_time/end_time`, `interview_schedule.assigned_at` — 은 plan §10.1 지침에 따라 **분 단위 정확도가 필요한 모든 필드는 `LocalDateTime` 사용**.

## 2. application 테이블의 기존 제약 — 코드 사실

V6 마이그레이션:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uk_application_recruitment_user_active
    ON application (recruitment_id, user_id)
    WHERE deleted_at IS NULL;
```

`Application` 엔티티:
- 클래스 레벨 `@UniqueConstraints` 어노테이션 없음
- `@Version private Long version` (OptimisticLock)
- Soft delete: `@SQLDelete` + `@SQLRestriction("deleted_at IS NULL")`

V45 마이그레이션이 추가할 `UNIQUE (id, recruitment_id)` 제약은 기존 `(recruitment_id, user_id)` partial unique index 와 의미·컬럼 모두 겹치지 않음. **충돌 없음**. composite FK 의 target 으로만 사용된다.

## 3. `InterviewScheduledEvent` 기존 시그니처 — 코드 사실

**기존 위치:** `backend/src/main/java/com/duing/domain/notification/event/InterviewScheduledEvent.java`

```java
public record InterviewScheduledEvent(
    Long applicationId,
    Long userId,
    String clubName,
    LocalDateTime interviewAt,
    String interviewLocation
) {}
```

**기존 사용처:** `InterviewScheduledListener.handle()` 가 `event.interviewAt()` 와 다른 필드들을 알림 본문 작성에 사용.

**plan / spec 의 의도와의 호환성:** 기존 5 필드와 spec 의 신규 발행 정보 (`applicationId`, `slotId`, `recruitmentId`) 는 **호환되지 않는다**. plan Task 1 Step 8 의 분기 — "호환 안 되면 spec 의 발행 정보에 맞춰 record 정의" — 적용 대상이며, 이때 기존 listener 도 새 시그니처에 맞춰 동시 갱신해야 한다. 알림 본문 작성에 필요한 정보 (slot 시간, 동아리명 등) 는 listener 내부에서 `applicationId` / `slotId` 로 repository 조회하여 얻는다.

## 4. `@TransactionalEventListener` 패턴 — 코드 사실

`RecruitmentOpenedListener`:
```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void handle(RecruitmentOpenedEvent event) {
    try { /* 알림 생성 */ }
    catch (Exception e) { /* log only */ }
}
```

`InterviewScheduledListener` 도 동일 패턴 (`AFTER_COMMIT` + 내부 try-catch + 예외 로깅) 을 이미 사용 중이다.

신규 `InterviewUpdatedListener`, `InterviewCancelledListener` (Task 11) 도 동일 패턴을 따른다.

---

## 결론

- 1·2·4 항목: 기존 사실이 plan / spec 과 일관됨. 그대로 진행 가능.
- 3 항목: `InterviewScheduledEvent` 의 5 필드 시그니처와 spec 의 3 필드 의도가 **호환 안 됨**. plan Task 1 Step 8 의 분기 — "호환 안 되면 spec 의 발행 정보에 맞춰 record 정의" — 가 적용된다. 새 시그니처는 `(Long applicationId, Long slotId, Long recruitmentId)` 이며, 기존 `InterviewScheduledListener` 의 시그니처/내부 로직도 동시에 갱신해야 한다.
