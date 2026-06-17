# 회비 관리 시스템 Sprint 2 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 1(청구 발행·조회) 위에 납부 처리·연체 자동화·인앱 알림·집계 대시보드를 붙여 회비 납부 사이클을 닫는다.

**Architecture:** `payment` 테이블(다중 행, VOID 이력 보존)을 추가하고, bill 상태는 "ACTIVE 납부 합계 + 마감일"로 단일 헬퍼(`FeeBillStatusCalculator`)가 산출한다. 연체는 일 1회 `@Scheduled` 크론이 set-based `UPDATE … RETURNING`으로 전이하며, 알림은 기존 `notification` 도메인의 `createIfAbsent`(dedupKey 멱등)를 재사용한다(인앱 전용, 이메일 없음). 대시보드는 QueryDSL 집계.

**Tech Stack:** Spring Boot 3.4 / Java 21 / PostgreSQL(Flyway·QueryDSL) · Next.js 15 / React 19 / TanStack Query / Zod (pnpm workspaces). 설계서: `docs/superpowers/specs/2026-06-17-fee-system-sprint2-design.md`.

전제: 이 계획은 `feat/fee-system-sprint2` 브랜치(develop 분기, Sprint 1+계좌 머지됨)에서 진행한다. 각 Task 는 현재 브랜치에 커밋만 하고 push/PR 은 하지 않는다(리뷰 후 오케스트레이터가 처리). 모든 통합 테스트는 실제 PostgreSQL(TestContainers)에서 돈다.

---

## File Structure

**백엔드** (`backend/src/main/java/com/duing/domain/fee/`)
- `entity/Payment.java` · `entity/PaymentMethod.java` · `entity/PaymentStatus.java` — 납부 애그리거트·enum
- `repository/PaymentRepository.java` — 납부 조회·합계, `FeeBillRepository`에 연체 전이 네이티브 쿼리 추가
- `service/FeeBillStatusCalculator.java` — 상태 산출 단일 헬퍼(Clock 주입)
- `service/{PaymentService,GeneralPaymentService}.java` — 납부 기록/취소(VOID)/내역
- `service/dto/command/{RecordPaymentCommand}.java` · `service/dto/query/{PaymentQuery,FeeBillSummaryQuery}.java`
- `exception/PaymentException.java`
- `controller/{LeaderPaymentController}.java` + `api/LeaderPaymentApi.java` + `controller/dto/request|response/*`
- `service/{FeeBillSummaryService,GeneralFeeBillSummaryService}.java` + `controller/LeaderFeeSummaryController` + api/dto — 대시보드
- `job/OverdueBillJob.java` · `config/FeeJobConfig.java` — 연체 크론
- `service/FeePaymentNotifier.java` — fee 알림 4종 생성(기존 notification 재사용)
- 수정: `entity/FeeBill.java`(상태 변경 메서드), `service/GeneralFeeBillService.java`(발행 알림 hook), `controller/dto/response/{FeeBillResponse,MyFeeResponse}` + QueryDSL `FeeBillRepositoryImpl`(paidAmount 보강)
- 수정: `domain/notification/entity/NotificationType.java`(FEE_* 4종 추가)

**프론트** (`frontend/`)
- `packages/types/src/fee.ts`(Payment·PaymentMethod·FeeBillSummary·보강 FeeBill/MyFee) · `packages/api/src/client.ts` · `packages/hooks/src/fee.ts`·`feeQueryKeys.ts` · `packages/schemas/src/index.ts`
- `apps/web/app/_lib/feeLabels.ts`(paymentMethodLabel)
- `apps/web/app/manage/clubs/[clubId]/fees/_components/{RecordPaymentDialog,PaymentHistory,FeeSummaryCards}.tsx` + `BillList.tsx` 보강
- `apps/web/app/me/_components/MyFeeList.tsx` 보강(진행률)

---

## Task 0: 공유 테스트 인프라 (payment TRUNCATE)

**Files:**
- Modify: `backend/src/test/java/com/duing/common/IntegrationTestBase.java`

- [ ] **Step 1: TRUNCATE 목록에 payment 추가**

`IntegrationTestBase`의 `TRUNCATE ... RESTART IDENTITY CASCADE` 테이블 목록에 `payment` 를 추가한다(`fee_bill`보다 먼저=자식 먼저, 단 CASCADE 라 순서 무관). 실제 목록 문자열을 열어 `fee_bill`/`fee_policy` 옆에 `payment` 를 넣는다.

- [ ] **Step 2: 컴파일 확인 + 커밋**

Run: `cd backend && ./gradlew compileTestJava`
Expected: BUILD SUCCESSFUL

```bash
git add backend/src/test/java/com/duing/common/IntegrationTestBase.java
git commit -m "chore(test): 통합테스트 TRUNCATE 목록에 payment 추가"
```

---

## Task BE-1: V62 payment 마이그레이션 + 엔티티 + 상태 산출 헬퍼

**Files:**
- Create: `backend/src/main/resources/db/migration/V62__create_payment.sql`
- Create: `backend/src/main/java/com/duing/domain/fee/entity/{PaymentMethod,PaymentStatus,Payment}.java`
- Create: `backend/src/main/java/com/duing/domain/fee/repository/PaymentRepository.java`
- Create: `backend/src/main/java/com/duing/domain/fee/service/FeeBillStatusCalculator.java`
- Modify: `backend/src/main/java/com/duing/domain/fee/entity/FeeBill.java`
- Test: `backend/src/test/java/com/duing/domain/fee/service/FeeBillStatusCalculatorTest.java`, `entity/PaymentTest.java`

- [ ] **Step 1: V62 마이그레이션** (기존 마이그레이션 수정 금지, V61 다음)

```sql
-- payment : fee_bill 1건에 대한 납부 기록(분할 입금 시 여러 행). 정정은 VOID 로 이력 보존.
CREATE TABLE payment (
    id            BIGSERIAL PRIMARY KEY,
    fee_bill_id   BIGINT NOT NULL REFERENCES fee_bill(id) ON DELETE RESTRICT,
    amount        BIGINT NOT NULL CHECK (amount > 0),
    method        VARCHAR(20) NOT NULL
                  CHECK (method IN ('CASH','TRANSFER','OTHER','AUTO_MATCHED')),  -- AUTO_MATCHED=Sprint 3 자동매칭 전용
    paid_at       TIMESTAMP WITH TIME ZONE NOT NULL,
    recorded_by   BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    memo          VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOIDED')),
    voided_by     BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    voided_at     TIMESTAMP WITH TIME ZONE,
    void_reason   VARCHAR(200),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_payment_bill ON payment (fee_bill_id) WHERE deleted_at IS NULL;
ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: enum 2개**

```java
package com.duing.domain.fee.entity;

public enum PaymentMethod { CASH, TRANSFER, OTHER, AUTO_MATCHED }
```
```java
package com.duing.domain.fee.entity;

public enum PaymentStatus { ACTIVE, VOIDED }
```

- [ ] **Step 3: Payment 엔티티** (Sprint 1 `FeeBill` 엔티티 스타일: `@SQLDelete`/`@SQLRestriction`, `@Builder(PRIVATE)`, static factory)

```java
package com.duing.domain.fee.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "payment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE payment SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Payment extends BaseEntity {

    @Column(name = "fee_bill_id", nullable = false)
    private Long feeBillId;

    @Column(nullable = false)
    private Long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    @Column(name = "paid_at", nullable = false)
    private LocalDateTime paidAt;

    @Column(name = "recorded_by", nullable = false)
    private Long recordedBy;

    @Column(length = 200)
    private String memo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentStatus status;

    @Column(name = "voided_by")
    private Long voidedBy;

    @Column(name = "voided_at")
    private LocalDateTime voidedAt;

    @Column(name = "void_reason", length = 200)
    private String voidReason;

    @Builder(access = AccessLevel.PRIVATE)
    private Payment(Long feeBillId, Long amount, PaymentMethod method, LocalDateTime paidAt,
                    Long recordedBy, String memo, PaymentStatus status) {
        this.feeBillId = feeBillId;
        this.amount = amount;
        this.method = method;
        this.paidAt = paidAt;
        this.recordedBy = recordedBy;
        this.memo = memo;
        this.status = status;
    }

    public static Payment record(Long feeBillId, Long amount, PaymentMethod method,
                                 LocalDateTime paidAt, Long recordedBy, String memo) {
        return Payment.builder()
                .feeBillId(feeBillId).amount(amount).method(method).paidAt(paidAt)
                .recordedBy(recordedBy).memo(memo).status(PaymentStatus.ACTIVE)
                .build();
    }

    /** 취소(VOID): 행을 보존한 채 상태만 전이하고 정정 메타를 남긴다. 이미 VOIDED 면 멱등 no-op. */
    public void voidPayment(Long actorId, String reason, LocalDateTime now) {
        if (this.status == PaymentStatus.VOIDED) {
            return;
        }
        this.status = PaymentStatus.VOIDED;
        this.voidedBy = actorId;
        this.voidedAt = now;
        this.voidReason = reason;
    }

    public boolean isActive() {
        return this.status == PaymentStatus.ACTIVE;
    }
}
```

- [ ] **Step 4: FeeBill 에 상태 변경 메서드 추가** (`FeeBill.java` 수정 — 기존 `cancel()` 옆)

```java
    /** 납부 재계산·연체 크론이 산출한 상태로 전이한다(CANCELLED 는 본 메서드로 바꾸지 않음). */
    public void updateStatus(FeeStatus newStatus) {
        this.status = newStatus;
    }
```

- [ ] **Step 5: PaymentRepository**

```java
package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.Payment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    // 납부 내역(ACTIVE+VOIDED 모두, 정정 이력 노출). 기록 순서.
    List<Payment> findByFeeBillIdOrderByCreatedAtAsc(Long feeBillId);

    Optional<Payment> findByIdAndFeeBillId(Long id, Long feeBillId);

    // 상태 산출용: ACTIVE 납부 합계(없으면 0).
    @Query("""
            SELECT COALESCE(SUM(p.amount), 0) FROM Payment p
            WHERE p.feeBillId = :feeBillId AND p.status = com.duing.domain.fee.entity.PaymentStatus.ACTIVE
            """)
    long sumActiveByFeeBillId(@Param("feeBillId") Long feeBillId);
}
```

- [ ] **Step 6: 상태 산출 헬퍼 테스트 먼저 (TDD)**

```java
package com.duing.domain.fee.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.duing.domain.fee.entity.FeeStatus;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FeeBillStatusCalculatorTest {

    // 오늘 = 2026-06-15 (Asia/Seoul) 고정
    private final Clock clock = Clock.fixed(
            LocalDate.of(2026, 6, 15).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));
    private final FeeBillStatusCalculator calculator = new FeeBillStatusCalculator(clock);

    @Test @DisplayName("완납(합계≥청구액)이면 PAID 다")
    void paid() {
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 10000L)).isEqualTo(FeeStatus.PAID);
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 1), 12000L)).isEqualTo(FeeStatus.PAID); // 마감 지나도 완납이면 PAID
    }

    @Test @DisplayName("부분납부 + 마감 전이면 PARTIAL_PAID 다")
    void partialBeforeDue() {
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 5000L)).isEqualTo(FeeStatus.PARTIAL_PAID);
    }

    @Test @DisplayName("미납 + 마감 전이면 PENDING 다")
    void pendingBeforeDue() {
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 30), 0L)).isEqualTo(FeeStatus.PENDING);
    }

    @Test @DisplayName("완납 안 됨 + 마감 경과면 미납·부분 모두 OVERDUE 다")
    void overdueWhenUnpaidPastDue() {
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 14), 0L)).isEqualTo(FeeStatus.OVERDUE);     // 미납 연체
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 14), 5000L)).isEqualTo(FeeStatus.OVERDUE);  // 부분 연체
    }

    @Test @DisplayName("마감일이 오늘이면 아직 연체 아니다")
    void dueTodayNotOverdue() {
        assertThat(calculator.calculate(10000L, LocalDate.of(2026, 6, 15), 0L)).isEqualTo(FeeStatus.PENDING);
    }
}
```

- [ ] **Step 7: 헬퍼 구현 (테스트 통과까지 최소)**

```java
package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeStatus;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

/** bill 상태를 "ACTIVE 납부 합계 + 마감일"로 산출하는 단일 헬퍼. 납부 기록/취소·연체 크론이 공유. */
@Component
public class FeeBillStatusCalculator {

    private final Clock clock; // Asia/Seoul Clock 빈(TimeConfig)

    public FeeBillStatusCalculator(Clock clock) {
        this.clock = clock;
    }

    public FeeStatus calculate(long billAmount, LocalDate dueDate, long activePaidSum) {
        if (activePaidSum >= billAmount) {
            return FeeStatus.PAID;
        }
        boolean pastDue = dueDate.isBefore(LocalDate.now(clock));
        if (activePaidSum > 0) {
            return pastDue ? FeeStatus.OVERDUE : FeeStatus.PARTIAL_PAID;
        }
        return pastDue ? FeeStatus.OVERDUE : FeeStatus.PENDING;
    }
}
```

- [ ] **Step 8: Payment 엔티티 단위 테스트** (`record` 가 ACTIVE 생성, `voidPayment` 가 VOIDED 전이+멱등)

`PaymentTest`: `Payment.record(...)` → `status==ACTIVE`·`isActive()`; `voidPayment(actor, reason, now)` → `status==VOIDED`·`voidedBy/at/reason` 세팅; 이미 VOIDED 에 재호출 → 메타 불변(멱등).

- [ ] **Step 9: 컴파일·테스트·커밋**

Run: `cd backend && ./gradlew compileJava compileTestJava && ./gradlew test --tests "com.duing.domain.fee.service.FeeBillStatusCalculatorTest" --tests "com.duing.domain.fee.entity.PaymentTest"`
Expected: BUILD SUCCESSFUL (Flyway V62 가 TestContainers 부팅 시 적용)

```bash
git add backend/src/main/resources/db/migration/V62__create_payment.sql \
        backend/src/main/java/com/duing/domain/fee/entity/Payment.java \
        backend/src/main/java/com/duing/domain/fee/entity/PaymentMethod.java \
        backend/src/main/java/com/duing/domain/fee/entity/PaymentStatus.java \
        backend/src/main/java/com/duing/domain/fee/repository/PaymentRepository.java \
        backend/src/main/java/com/duing/domain/fee/service/FeeBillStatusCalculator.java \
        backend/src/main/java/com/duing/domain/fee/entity/FeeBill.java \
        backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): 회비 납부 도메인 기반(V62 payment·상태 산출 헬퍼) 추가"
```

---

## Task BE-2: 납부 기록·취소(VOID)·내역 API + bill 응답 보강

**Files:**
- Create: `exception/PaymentException.java`, `service/dto/command/RecordPaymentCommand.java`, `service/dto/query/PaymentQuery.java`, `service/{PaymentService,GeneralPaymentService}.java`
- Create: `api/LeaderPaymentApi.java`, `controller/LeaderPaymentController.java`, `controller/dto/request/RecordPaymentRequest.java`, `controller/dto/request/VoidPaymentRequest.java`, `controller/dto/response/PaymentResponse.java`
- Modify: `controller/dto/response/FeeBillResponse.java`, `MyFeeResponse.java`, `repository/FeeBillRepositoryImpl.java`(QueryDSL paidAmount), `service/dto/query/FeeBillQuery.java`/`MyFeeQuery`
- Test: `backend/src/test/java/com/duing/domain/fee/LeaderPaymentControllerTest.java`

- [ ] **Step 1: 예외** (풀네임 inner 컨벤션)

```java
package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PaymentException extends ApplicationException {
    protected PaymentException(String message, HttpStatus status) { super(message, status); }

    public static class PaymentNotFoundException extends PaymentException {
        public PaymentNotFoundException() { super("납부 기록을 찾을 수 없습니다.", HttpStatus.NOT_FOUND); }
    }
    public static class PaymentExceedsRemainingException extends PaymentException {
        public PaymentExceedsRemainingException() { super("납부 금액이 남은 미납액을 초과합니다.", HttpStatus.BAD_REQUEST); }
    }
    public static class BillNotPayableException extends PaymentException {
        public BillNotPayableException() { super("취소된 청구에는 납부를 기록할 수 없습니다.", HttpStatus.CONFLICT); }
    }
    public static class ManualMethodRequiredException extends PaymentException {
        public ManualMethodRequiredException() { super("수동 납부 기록에는 현금/계좌이체/기타만 사용할 수 있습니다.", HttpStatus.BAD_REQUEST); }
    }
}
```

- [ ] **Step 2: command/query DTO**

```java
// RecordPaymentCommand.java (service/dto/command)
package com.duing.domain.fee.service.dto.command;
import com.duing.domain.fee.entity.PaymentMethod;
import java.time.LocalDate;
public record RecordPaymentCommand(
        Long clubId, Long actorId, Long billId,
        Long amount, PaymentMethod method, LocalDate paidAt, String memo) {}
```
```java
// PaymentQuery.java (service/dto/query)
package com.duing.domain.fee.service.dto.query;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import java.time.LocalDateTime;
public record PaymentQuery(Long id, Long amount, PaymentMethod method, LocalDateTime paidAt,
                           String memo, PaymentStatus status, String voidReason) {
    public static PaymentQuery from(Payment p) {
        return new PaymentQuery(p.getId(), p.getAmount(), p.getMethod(), p.getPaidAt(),
                p.getMemo(), p.getStatus(), p.getVoidReason());
    }
}
```

- [ ] **Step 3: PaymentService (인터페이스 + 구현)** — bill 잠금·상태 재계산·알림 hook

```java
// PaymentService.java
package com.duing.domain.fee.service;
import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import java.util.List;
public interface PaymentService {
    Long record(RecordPaymentCommand command);
    void voidPayment(Long clubId, Long actorId, Long billId, Long paymentId, String reason);
    List<PaymentQuery> getPayments(Long clubId, Long actorId, Long billId);
}
```
```java
// GeneralPaymentService.java
package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.exception.PaymentException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPaymentService implements PaymentService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final ClubAuthService clubAuthService;
    private final FeeBillStatusCalculator statusCalculator;
    private final FeePaymentNotifier notifier; // BE-3 에서 구현, 여기서 주입(같은 PR 묶음이면 BE-3 먼저 머지 후)
    private final Clock clock;

    @Override
    @Transactional
    public Long record(RecordPaymentCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        if (command.method() == PaymentMethod.AUTO_MATCHED) {
            throw new PaymentException.ManualMethodRequiredException();
        }
        // 비관적 잠금으로 동시 납부 기록의 상태 재계산을 직렬화한다.
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(command.billId(), command.clubId())
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        if (bill.getStatus() == FeeStatus.CANCELLED) {
            throw new PaymentException.BillNotPayableException();
        }
        long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
        long remaining = bill.getAmount() - activePaid;
        if (command.amount() > remaining) {
            throw new PaymentException.PaymentExceedsRemainingException();
        }
        // paid_at(timestamptz): 총무가 보고한 납부일을 Asia/Seoul 자정으로 저장(이벤트 순서는 created_at 으로 추적).
        LocalDateTime paidAt = command.paidAt().atStartOfDay(SEOUL).toLocalDateTime();
        Payment payment = paymentRepository.save(
                Payment.record(bill.getId(), command.amount(), command.method(), paidAt, command.actorId(), command.memo()));

        long newSum = activePaid + command.amount();
        FeeStatus newStatus = statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), newSum);
        bill.updateStatus(newStatus);

        long newRemaining = bill.getAmount() - newSum;
        notifier.notifyPaymentConfirmed(bill, newStatus, newRemaining, payment.getId());
        return payment.getId();
    }

    @Override
    @Transactional
    public void voidPayment(Long clubId, Long actorId, Long billId, Long paymentId, String reason) {
        clubAuthService.requireManager(actorId, clubId);
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        Payment payment = paymentRepository.findByIdAndFeeBillId(paymentId, billId)
                .orElseThrow(PaymentException.PaymentNotFoundException::new);
        payment.voidPayment(actorId, reason, LocalDateTime.now(clock)); // 이미 VOIDED 면 멱등 no-op
        long activePaid = paymentRepository.sumActiveByFeeBillId(billId);
        bill.updateStatus(statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), activePaid));
    }

    @Override
    public List<PaymentQuery> getPayments(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return paymentRepository.findByFeeBillIdOrderByCreatedAtAsc(billId).stream()
                .map(PaymentQuery::from).toList();
    }
}
```

> 주: `FeePaymentNotifier` 는 BE-3 에서 만든다. BE-2 를 먼저 구현하려면 `FeePaymentNotifier` 를 **no-op 빈 인터페이스+구현**으로 먼저 두고 BE-3 에서 채우거나, BE-3 의 `FeePaymentNotifier` 골격(인터페이스+빈 구현)을 BE-2 에 포함시킨다. 구현 시작 시 한 가지를 택해 일관 유지.

- [ ] **Step 4: request/response DTO + api/controller** (BE-2 회비 정책/청구 컨트롤러 패턴 그대로 — `ApiResponse.success`, `@PreAuthorize("isAuthenticated()")`, `currentUser.id()`, HTTP 201/200/204)

```java
// RecordPaymentRequest.java
package com.duing.domain.fee.controller.dto.request;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.service.dto.command.RecordPaymentCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
public record RecordPaymentRequest(
        @NotNull(message = "납부 금액은 필수입니다.") @Positive(message = "납부 금액은 1원 이상이어야 합니다.") Long amount,
        @NotNull(message = "납부 수단은 필수입니다.") PaymentMethod method,
        @NotNull(message = "납부일은 필수입니다.") LocalDate paidAt,
        @Size(max = 200, message = "메모는 200자 이하여야 합니다.") String memo) {
    public RecordPaymentCommand toCommand(Long clubId, Long actorId, Long billId) {
        return new RecordPaymentCommand(clubId, actorId, billId, amount, method, paidAt, memo);
    }
}
```
```java
// VoidPaymentRequest.java
package com.duing.domain.fee.controller.dto.request;
import jakarta.validation.constraints.Size;
public record VoidPaymentRequest(@Size(max = 200, message = "사유는 200자 이하여야 합니다.") String reason) {}
```
```java
// PaymentResponse.java
package com.duing.domain.fee.controller.dto.response;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import java.time.LocalDateTime;
public record PaymentResponse(Long id, Long amount, PaymentMethod method, LocalDateTime paidAt,
                              String memo, PaymentStatus status, String voidReason) {
    public static PaymentResponse from(PaymentQuery q) {
        return new PaymentResponse(q.id(), q.amount(), q.method(), q.paidAt(), q.memo(), q.status(), q.voidReason());
    }
}
```
컨트롤러 `LeaderPaymentController`(`@RequestMapping("/api/v1")`, `LeaderPaymentApi` implements):
- `POST /leader/clubs/{clubId}/fee-bills/{billId}/payments` → 201 `ApiResponse<Long>`(payment id), `record(request.toCommand(clubId, currentUser.id(), billId))`
- `GET  /leader/clubs/{clubId}/fee-bills/{billId}/payments` → 200 `ApiResponse<List<PaymentResponse>>`
- `POST /leader/clubs/{clubId}/fee-bills/{billId}/payments/{paymentId}/void` → 204, `voidPayment(...)`
컨트롤러 구현 메서드에 `@PathVariable`·`@Valid @RequestBody`·`@AuthenticationPrincipal` 를 명시(BE-2 회비 정책 컨트롤러와 동일).

- [ ] **Step 5: bill 응답 보강 (`paidAmount`/`remainingAmount`)**

`FeeBillResponse`·`MyFeeResponse` 레코드에 `Long paidAmount`·`Long remainingAmount` 필드를 추가한다. 값은 **QueryDSL 조회 시 계산**: `FeeBillRepositoryImpl`(Sprint 1 BE-4)의 `searchClubBills`/`searchMyBills` 에 `payment`(status=ACTIVE) 합계 서브쿼리/left join 을 더해 bill 별 `paidAmount` 를 집계하고(`COALESCE(SUM,0)`), `remaining = amount − paidAmount`. `FeeBillQuery`/`MyFeeQuery` 에 두 필드를 추가하고 `Response.from` 에서 전달. QueryDSL 집계는 `JPAExpressions.select(payment.amount.sum().coalesce(0L)).from(payment).where(payment.feeBillId.eq(feeBill.id), payment.status.eq(ACTIVE))` 형태의 상관 서브쿼리로 select 절에 넣는다(별도 group by 회피).

- [ ] **Step 6: 통합 테스트** (`LeaderPaymentControllerTest`, RestAssured + TestContainers, 실 본문)

핵심 케이스(`@DisplayName` 한국어):
```text
- 부분 납부를 기록하면 청구가 PARTIAL_PAID 가 되고 paidAmount/remaining 이 맞다
- 남은 금액을 모두 납부하면 PAID 가 된다(분할 2회 합산)
- 마감 지난 청구에 부분 납부하면 OVERDUE 가 유지된다
- 남은 미납액을 초과해 납부하면 400 이다
- 취소된(CANCELLED) 청구에 납부하면 409 다
- method=AUTO_MATCHED 로 수동 기록하면 400 이다
- 납부를 VOID 하면 합계·상태가 재계산되고, payment 행은 보존되어 내역에 VOIDED 로 노출된다
- 이미 VOIDED 인 납부를 다시 VOID 해도 멱등(상태 불변)이다
- 비총무가 납부 기록/취소 시 403, 다른 동아리 청구는 404 다
- 같은 청구에 동시(N 스레드) 납부 기록 시 합계·상태가 일관된다(비관적 잠금) — IntegrationTestBase 상속, @Transactional 금지, CyclicBarrier
```

- [ ] **Step 7: 실행 + 커밋**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.*"`
```bash
git checkout -b feat/fee-payment-api 2>/dev/null; true   # 새 브랜치 만들지 말 것 — 현재 feat/fee-system-sprint2 에 커밋
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee/LeaderPaymentControllerTest.java
git commit -m "feat(backend): 회비 납부 기록·취소(VOID)·내역 API + 청구 납부 진행률 보강"
```
> 위 `git checkout -b` 줄은 실수 방지용 주석이다 — 실제로는 새 브랜치를 만들지 말고 현재 `feat/fee-system-sprint2` 에 커밋한다.

---

## Task BE-3: 연체 크론 + 인앱 알림 (notification 재사용)

**Files:**
- Create: `service/FeePaymentNotifier.java`(인터페이스 + `GeneralFeePaymentNotifier`), `job/OverdueBillJob.java`, `config/FeeJobConfig.java`
- Modify: `domain/notification/entity/NotificationType.java`, `domain/fee/service/GeneralFeeBillService.java`(발행 알림 hook), `repository/FeeBillRepository.java`(연체 전이 RETURNING)
- Config: `application.yml`(`duing.fee.overdue.enabled`), test `application.yml`(false)
- Test: `OverdueBillJobTest.java`, `FeePaymentNotifierTest`(or 통합으로 검증)

- [ ] **Step 1: NotificationType 에 fee 4종 추가** (`domain/notification/entity/NotificationType.java`)

```java
    // ... 기존 값 유지 ...
    FEE_BILL_ISSUED,
    FEE_BILL_OVERDUE,
    FEE_PARTIAL_PAYMENT_CONFIRMED,
    FEE_PAID_CONFIRMED
```

- [ ] **Step 2: FeePaymentNotifier (알림 4종 생성, createIfAbsent 멱등 재사용)**

```java
// FeePaymentNotifier.java
package com.duing.domain.fee.service;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
public interface FeePaymentNotifier {
    void notifyBillIssued(Long userId, Long clubId, String clubName, String billingPeriod,
                          java.time.LocalDate dueDate, Long billId);
    void notifyOverdue(Long userId, String billingPeriod, Long billId);
    void notifyPaymentConfirmed(FeeBill bill, FeeStatus newStatus, long remaining, Long paymentId);
}
```
```java
// GeneralFeePaymentNotifier.java
package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.time.LocalDate;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GeneralFeePaymentNotifier implements FeePaymentNotifier {

    private static final String LINK = "/me/fees";
    private final NotificationService notificationService;

    @Override
    public void notifyBillIssued(Long userId, Long clubId, String clubName, String billingPeriod,
                                 LocalDate dueDate, Long billId) {
        notificationService.createIfAbsent(new CreateNotificationCommand(
                userId, NotificationType.FEE_BILL_ISSUED,
                clubName + " 회비가 청구되었어요",
                billingPeriod + " · 마감 " + dueDate, LINK,
                Map.of("clubId", clubId, "billId", billId),
                "FEE_BILL_ISSUED:b=" + billId));
    }

    @Override
    public void notifyOverdue(Long userId, String billingPeriod, Long billId) {
        notificationService.createIfAbsent(new CreateNotificationCommand(
                userId, NotificationType.FEE_BILL_OVERDUE,
                "회비가 연체되었어요",
                billingPeriod + " 회비 납부 기한이 지났어요", LINK,
                Map.of("billId", billId),
                "FEE_BILL_OVERDUE:b=" + billId));
    }

    @Override
    public void notifyPaymentConfirmed(FeeBill bill, FeeStatus newStatus, long remaining, Long paymentId) {
        if (newStatus == FeeStatus.PAID) {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    bill.getUserId(), NotificationType.FEE_PAID_CONFIRMED,
                    "회비 납부가 완료되었어요", bill.getBillingPeriod() + " 회비 완납 확인", LINK,
                    Map.of("billId", bill.getId()),
                    "FEE_PAID_CONFIRMED:b=" + bill.getId()));
        } else if (newStatus == FeeStatus.PARTIAL_PAID || newStatus == FeeStatus.OVERDUE) {
            notificationService.createIfAbsent(new CreateNotificationCommand(
                    bill.getUserId(), NotificationType.FEE_PARTIAL_PAYMENT_CONFIRMED,
                    "회비 일부 납부가 확인되었어요", "남은 금액 " + remaining + "원", LINK,
                    Map.of("billId", bill.getId(), "remaining", remaining),
                    // 부분 납부는 건마다 안내 — dedup 은 paymentId 단위
                    "FEE_PARTIAL_PAYMENT_CONFIRMED:p=" + paymentId));
        }
    }
}
```

- [ ] **Step 3: 발행 알림 hook** — Sprint 1 `GeneralFeeBillService.generateBills` 끝에 추가

`generateBills` 가 `bulkInsertBills` 로 청구를 발행한 뒤, 발행된 청구의 `(user_id)` 목록이 필요하다. `bulkInsertBills` 는 건수만 반환하므로, 발행 대상 활성 회원 `user_id` 목록을 한 번 더 조회(`ClubMemberRepository.findActiveUserIdsByClubId` 가 BE-1 sprint1 에서 count 로 바뀌었으면 userId 목록 조회 메서드를 추가)하거나, **이미 같은 회차로 발행된 건 제외하지 않고** 활성 회원 전원에게 `createIfAbsent`(dedupKey=`FEE_BILL_ISSUED:b=<billId>`)로 보낸다. 가장 단순·정확: 발행 직후 `feeBillRepository` 에서 `(policyId, billingStartDate)` 회차의 **해당 club 활성 청구 (id, user_id)** 를 조회해 각 회원에게 `notifier.notifyBillIssued(...)`. clubName 은 `clubRepository.findById(clubId)` 로 얻는다. 알림은 멱등(dedupKey)이라 재발행에도 중복 없음.

```java
        // generateBills 끝부분(반환 직전)에 추가
        String clubName = clubRepository.findById(command.clubId()).map(Club::getName).orElse("동아리");
        feeBillRepository.findIssuedBillRecipients(policy.getId(), resolved.startDate())
                .forEach(row -> notifier.notifyBillIssued(
                        row.userId(), command.clubId(), clubName, resolved.billingPeriod(),
                        resolved.dueDate(), row.billId()));
```
`FeeBillRepository` 에 회차 수신자 조회 추가:
```java
    @Query("""
            SELECT new com.duing.domain.fee.repository.BillRecipient(b.id, b.userId)
            FROM FeeBill b
            WHERE b.feePolicyId = :feePolicyId AND b.billingStartDate = :startDate
              AND b.status <> com.duing.domain.fee.entity.FeeStatus.CANCELLED
            """)
    List<BillRecipient> findIssuedBillRecipients(@Param("feePolicyId") Long feePolicyId,
                                                 @Param("startDate") java.time.LocalDate startDate);
```
`record BillRecipient(Long billId, Long userId) {}` (repository 패키지). `GeneralFeeBillService` 에 `FeePaymentNotifier`·`ClubRepository` 주입.

- [ ] **Step 4: 연체 전이 RETURNING 쿼리** (`FeeBillRepository`)

```java
    // 마감 지난 미납·부분납부 청구를 OVERDUE 로 전이하고, 이번에 실제 전이된 (id, user_id, billing_period) 만 반환(멱등 알림).
    @Modifying(clearAutomatically = true)
    @Query(value = """
            UPDATE fee_bill
               SET status = 'OVERDUE', updated_at = now()
             WHERE status IN ('PENDING','PARTIAL_PAID')
               AND due_date < :today
               AND deleted_at IS NULL
            RETURNING id, user_id, billing_period
            """, nativeQuery = true)
    List<Object[]> transitionOverdueReturning(@Param("today") java.time.LocalDate today);
```
> 주: `@Modifying` + `RETURNING` 의 결과 매핑은 드라이버/하이버 버전에 따라 다를 수 있다 — 구현 시 `List<Object[]>` 로 받히지 않으면, `SELECT id,user_id,billing_period ... FOR UPDATE` 로 후보를 먼저 조회→`UPDATE … WHERE id IN (...)`→조회분으로 알림, 두 단계로 분리한다(일 1회 저빈도라 허용). 둘 중 동작하는 방식을 택하고 테스트로 고정.

- [ ] **Step 5: 연체 크론 + 설정**

```java
// FeeJobConfig.java
package com.duing.domain.fee.config;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.fee.overdue", name = "enabled", havingValue = "true")
public class FeeJobConfig {}
```
```java
// OverdueBillJob.java
package com.duing.domain.fee.job;

import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.service.FeePaymentNotifier;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 매일 00:10(Asia/Seoul) 마감 지난 미납·부분납부 청구를 OVERDUE 로 전이하고, 실제 전이된 청구만 연체 알림. */
@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "duing.fee.overdue", name = "enabled", havingValue = "true")
public class OverdueBillJob {

    private final FeeBillRepository feeBillRepository;
    private final FeePaymentNotifier notifier;
    private final Clock clock;

    @Scheduled(cron = "0 10 0 * * *", zone = "Asia/Seoul")
    @Transactional
    public void run() {
        LocalDate today = LocalDate.now(clock);
        List<Object[]> transitioned = feeBillRepository.transitionOverdueReturning(today);
        log.info("OverdueBillJob: transitioned={}", transitioned.size());
        for (Object[] row : transitioned) {
            Long billId = ((Number) row[0]).longValue();
            Long userId = ((Number) row[1]).longValue();
            String billingPeriod = (String) row[2];
            notifier.notifyOverdue(userId, billingPeriod, billId);
        }
    }
}
```
설정: `application.yml` 에 `duing.fee.overdue.enabled: ${DUING_FEE_OVERDUE_ENABLED:false}` 추가, test `application.yml` 에 `duing.fee.overdue.enabled: false`. `.env.example` 에 `DUING_FEE_OVERDUE_ENABLED=true`(운영) 문서화.

- [ ] **Step 6: 테스트** (크론은 메서드 직접 호출, 고정 Clock)

`OverdueBillJobTest`(IntegrationTestBase 상속, 고정 Clock 빈은 테스트 설정으로 주입 — Sprint 1 패턴):
```text
- 마감 지난 PENDING·PARTIAL_PAID 만 OVERDUE 로 전이된다(PAID·CANCELLED·마감 전 제외)
- 재실행해도 추가 전이 없음(멱등)이고, 연체 알림은 이미 OVERDUE 인 청구에 재발송되지 않는다
- 전이된 청구의 회원에게 FEE_BILL_OVERDUE 알림이 생성된다
```
알림 검증은 `notification` 저장소를 조회해 type·userId·dedupKey 로 단언. 발행/납부확인 알림은 `LeaderFeeBillControllerTest`(발행)·`LeaderPaymentControllerTest`(납부확인)에 단언을 추가:
```text
- 청구 발행 시 청구받은 회원에게 FEE_BILL_ISSUED 알림이 생성된다
- 완납 시 FEE_PAID_CONFIRMED, 부분 납부 시 FEE_PARTIAL_PAYMENT_CONFIRMED 알림이 생성된다
```

- [ ] **Step 7: 실행 + 커밋**

Run: `cd backend && ./gradlew test --tests "com.duing.domain.fee.*"`
```bash
git add backend/src/main/java/com/duing/domain/fee backend/src/main/java/com/duing/domain/notification/entity/NotificationType.java \
        backend/src/main/resources/application.yml backend/src/test/resources/application.yml backend/.env.example \
        backend/src/test/java/com/duing/domain/fee
git commit -m "feat(backend): 회비 연체 크론 + 인앱 알림(발행·연체·납부확인) 추가"
```

---

## Task BE-4: 집계 대시보드 API

**Files:**
- Create: `service/{FeeBillSummaryService,GeneralFeeBillSummaryService}.java`, `service/dto/query/{FeeBillSummaryQuery,FeeBillSummary}.java`, `api/LeaderFeeSummaryApi.java`, `controller/LeaderFeeSummaryController.java`, `controller/dto/response/FeeSummaryResponse.java`, QueryDSL 집계는 `FeeBillRepositoryImpl` 에 메서드 추가
- Test: `LeaderFeeSummaryControllerTest.java`

- [ ] **Step 1: 집계 쿼리(QueryDSL)** — `FeeBillRepositoryCustom`/`Impl` 에 추가

`summarize(clubId, billingPeriod?, policyId?)` → 한 번의 쿼리로:
- `totalBilled = SUM(fee_bill.amount)` (CANCELLED·deleted 제외)
- `billCount`, 상태별 건수(`PENDING/PARTIAL_PAID/OVERDUE/PAID`) — `CASE WHEN` 합계
- `totalPaid = SUM(ACTIVE payment.amount)` — payment(ACTIVE) join (CANCELLED bill 제외)
필터: `feeBill.clubId=:clubId`, 옵션 `billingPeriod`/`feePolicyId`, `feeBill.status <> CANCELLED`, `deleted_at IS NULL`. 결과를 `FeeBillSummaryRow`(projection)로 받아 서비스에서 `미수금=totalBilled−totalPaid`, `수납률=totalPaid/totalBilled` 계산.

- [ ] **Step 2: service + DTO + api/controller**

`FeeBillSummary(totalBilled, totalPaid, outstanding, collectionRate, billCount, pendingCount, partialCount, overdueCount, paidCount)`. `GeneralFeeBillSummaryService.getSummary(clubId, actorId, query)`: `requireManager` 후 집계. `collectionRate` 는 `totalBilled==0 ? 0 : round(totalPaid*100/totalBilled)`(정수 % 또는 소수 1자리 — 응답은 double). 컨트롤러 `GET /leader/clubs/{clubId}/fee-bills/summary?billingPeriod=&policyId=` → 200.

- [ ] **Step 3: 테스트**
```text
- 청구 3건(완납1·부분1·미납1)일 때 totalBilled·totalPaid·미수금·수납률·상태별 건수가 정확하다
- VOID 된 납부는 totalPaid 에 포함되지 않는다
- CANCELLED 청구는 집계에서 제외된다
- billingPeriod 필터가 동작한다
- 비총무 403
```

- [ ] **Step 4: 실행 + 커밋**

```bash
git add backend/src/main/java/com/duing/domain/fee backend/src/test/java/com/duing/domain/fee/LeaderFeeSummaryControllerTest.java
git commit -m "feat(backend): 회비 수납 현황 집계 대시보드 API 구현"
```

---

## Task FE-1: 프론트 packages 배선

**Files:** `frontend/packages/{types,api,hooks,schemas}/src/*`, `apps/web/app/_lib/feeLabels.ts`

- [ ] **Step 1: 타입** (`packages/types/src/fee.ts`) — 백엔드 응답 DTO 와 1:1

```ts
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'OTHER' | 'AUTO_MATCHED';
export type PaymentStatus = 'ACTIVE' | 'VOIDED';
export type Payment = {
  id: number; amount: number; method: PaymentMethod;
  paidAt: string; memo: string | null; status: PaymentStatus; voidReason: string | null;
};
export type RecordPaymentPayload = { amount: number; method: 'CASH' | 'TRANSFER' | 'OTHER'; paidAt: string; memo?: string };
export type FeeBillSummary = {
  totalBilled: number; totalPaid: number; outstanding: number; collectionRate: number;
  billCount: number; pendingCount: number; partialCount: number; overdueCount: number; paidCount: number;
};
// 기존 FeeBill·MyFee 에 paidAmount·remainingAmount 추가
```

- [ ] **Step 2: api 클라이언트** (`packages/api/src/client.ts`) — `leader.fees.*` 확장
`payments.record(clubId, billId, payload)` / `payments.list(clubId, billId)` / `payments.void(clubId, billId, paymentId, reason?)` / `summary(clubId, params)`. `jsonOk`/`jsonVoid`/`cleanParams` 재사용.

- [ ] **Step 3: hooks + queryKeys** — `useBillPaymentsQuery`·`useRecordPaymentMutation`·`useVoidPaymentMutation`·`useClubFeeSummaryQuery`. record/void 성공 시 청구 목록(`billsByClub`)·해당 bill 납부내역·summary 무효화.

- [ ] **Step 4: schemas** — `recordPaymentSchema`: `amount`(coerce int ≥1), `method`(z.enum `['CASH','TRANSFER','OTHER']` — AUTO_MATCHED 불가), `paidAt`(date string), `memo`(optional ≤200). 한국어 메시지.

- [ ] **Step 5: feeLabels** — `paymentMethodLabel`(CASH 현금/TRANSFER 계좌이체/OTHER 기타/AUTO_MATCHED 자동매칭).

- [ ] **Step 6: typecheck + 커밋**
Run: `cd frontend && pnpm -w typecheck`
```bash
git commit -am "feat(frontend): 회비 납부·집계 타입·API·훅·스키마 배선"
```

---

## Task FE-2: 청구 탭 납부 기록·내역·진행률

**Files:** `_components/{RecordPaymentDialog,PaymentHistory}.tsx`, `BillList.tsx` 보강, `me/_components/MyFeeList.tsx` 보강, test

- [ ] **Step 1: RecordPaymentDialog** — `useForm(zodResolver(recordPaymentSchema))`: 금액(기본=remaining)·수단 select(현금/계좌이체/기타)·납부일(기본 오늘)·메모. `useRecordPaymentMutation`, 성공 토스트 + 목록 invalidate. `ApiError` 처리(400 초과/409 취소청구).
- [ ] **Step 2: PaymentHistory** — `useBillPaymentsQuery`. 행: 금액·수단(label)·납부일. `ACTIVE` 는 "취소" 버튼(확인 다이얼로그 → `useVoidPaymentMutation`), `VOIDED` 는 취소선/배지 + 사유.
- [ ] **Step 3: BillList 보강** — 각 행에 진행률(`paidAmount`/`amount`) + 상태 뱃지(PAID/PARTIAL/OVERDUE, 기존 `feeStatusLabel`) + "납부 기록"·"내역" 액션.
- [ ] **Step 4: MyFeeList 보강** — 회원 청구에 진행률(`paidAmount`/`remainingAmount`) 읽기 전용 표시.
- [ ] **Step 5: 테스트(Vitest+RTL, `@duing/hooks` mock)** — 납부 다이얼로그 검증(초과/수단)·진행률·VOID 표시·상태 뱃지. 기존 `bill-list`/`my-fees` 테스트의 hook mock 에 신규 훅 추가(회귀 방지).
- [ ] **Step 6: typecheck+test+커밋**
```bash
git commit -am "feat(frontend): 회비 청구 탭 납부 기록·내역(VOID)·진행률 구현"
```

---

## Task FE-3: 청구 탭 대시보드 요약 카드

**Files:** `_components/FeeSummaryCards.tsx`, `ClubFeesPage` 청구 탭 상단 연결, test

- [ ] **Step 1: FeeSummaryCards** — `useClubFeeSummaryQuery(clubId, { billingPeriod })`. 카드: 수납률(%)·미수금·총 청구액 + 상태별 건수 배지. 회차 필터(청구 탭 필터)와 `billingPeriod` 연동. 로딩/빈 상태.
- [ ] **Step 2: 청구 탭 상단 연결** — `ClubFeesPage`의 청구 패널 최상단에 `<FeeSummaryCards>` 배치(별도 탭 아님).
- [ ] **Step 3: 테스트** — 집계 수치 렌더·수납률 포맷·빈 상태.
- [ ] **Step 4: typecheck+test+커밋**
```bash
git commit -am "feat(frontend): 회비 청구 탭 수납 현황 요약 카드 구현"
```

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지**: 납부(BE-1·2/FE-2)·연체 크론(BE-3)·알림 4종(BE-3, FEE_BILL_ISSUED/OVERDUE/PARTIAL/PAID)·대시보드(BE-4/FE-3)·VOID 이력 보존(BE-1·2)·AUTO_MATCHED 수동 제외(BE-1·2)·paid_at timestamptz(BE-1)·paidAmount 실시간(BE-2)·연체 알림 멱등(BE-3, dedupKey+RETURNING) — 설계서 §3~10 전 항목 매핑됨.
- **타입 일관성**: `FeeBillStatusCalculator.calculate(billAmount,dueDate,activePaidSum)`, `Payment.record/voidPayment`, `PaymentRepository.sumActiveByFeeBillId`, `FeePaymentNotifier.notify*`, `NotificationService.createIfAbsent(CreateNotificationCommand)` 가 전 구간 동일 시그니처로 사용됨.
- **확인 보류(구현 시작 시 실파일 대조)**: ① `@Modifying`+`RETURNING` 결과 매핑(불가 시 select→update 2단계로) ② Sprint 1 BE-4 의 `FeeBillRepositoryImpl`/`FeeBillQuery` 정확한 구조에 paidAmount 상관 서브쿼리 결합 ③ `FeePaymentNotifier` 를 BE-2 와 BE-3 중 어디서 골격 생성할지(순환 주입 방지) ④ 고정 `Clock` 빈 테스트 주입 방식(Sprint 1 동일). 이는 placeholder 가 아니라 "기존 구현과 1:1 정렬" 지시.
