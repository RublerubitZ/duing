package com.duing.domain.fee.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
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
import com.duing.domain.fee.service.dto.command.VoidPaymentCommand;
import com.duing.domain.fee.service.dto.query.PaymentQuery;
import com.duing.domain.notification.event.FeePaymentConfirmedEvent;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPaymentService implements PaymentService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final ClubAuthService clubAuthService;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final FeeBillStatusRefresher statusRefresher;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    @Override
    @Transactional
    public Long record(RecordPaymentCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        if (command.method() == PaymentMethod.AUTO_MATCHED) {
            throw new PaymentException.ManualMethodRequiredException();
        }
        // 비관적 잠금: 같은 청구에 대한 동시 분할 입금이 남은 미납액 검증·합계 산출을 직렬화하도록 한다.
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(command.billId(), command.clubId())
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        if (bill.getStatus() == FeeStatus.CANCELLED) {
            throw new PaymentException.BillNotPayableException();
        }
        long activePaid = paymentRepository.sumActiveByFeeBillId(command.billId());
        long remaining = bill.remainingAfter(activePaid);
        if (command.amount() > remaining) {
            throw new PaymentException.PaymentExceedsRemainingException();
        }

        // 수기 납부일은 KST 날짜라 KST 자정의 절대시각으로 굳힌다.
        Instant paidAt = command.paidAt().atStartOfDay(SEOUL).toInstant();
        Payment payment = paymentRepository.save(Payment.record(
                command.billId(), command.amount(), command.method(), paidAt, command.actorId(), command.memo()));

        long newSum = activePaid + command.amount();
        FeeStatus newStatus = statusRefresher.refresh(bill, newSum);
        eventPublisher.publishEvent(new FeePaymentConfirmedEvent(
                bill.getUserId(), bill.getId(), bill.getBillingPeriod(), newStatus,
                bill.remainingAfter(newSum), payment.getId(), false)); // 수동 납부 기록은 자동매칭이 아니다

        log.info("payment recorded: actorId={}, clubId={}, billId={}, paymentId={}, amount={}, newStatus={}",
                command.actorId(), command.clubId(), command.billId(), payment.getId(), command.amount(), newStatus);
        // 수기 기록이라 연결된 입금 거래가 없다(bankTransactionId=null, autoMatched=false).
        // payment 는 IDENTITY 생성이라 save 시점에 INSERT 가 나가므로 감사 행의 payment_id FK 가 성립한다.
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_RECORDED, command.clubId(), bill.getId(),
                payment.getId(), null, command.actorId(), null,
                AuditDetailJson.of(Map.of(
                        "amount", command.amount(),
                        "method", command.method().name(),
                        "autoMatched", false))));
        return payment.getId();
    }

    @Override
    @Transactional
    public void voidPayment(VoidPaymentCommand command) {
        clubAuthService.requireManager(command.actorId(), command.clubId());
        // 정정도 같은 청구 행을 비관적 잠금해 동시 납부 기록과 합계 재계산을 직렬화한다.
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(command.billId(), command.clubId())
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        Payment payment = paymentRepository.findByIdAndFeeBillId(command.paymentId(), command.billId())
                .orElseThrow(PaymentException.PaymentNotFoundException::new);

        // 감사는 실제 VOID 전이가 일어났을 때만 남긴다 — 멱등 재호출로 정정 이력이 부풀지 않게 호출 전 상태를 캡처한다.
        boolean wasActive = payment.isActive();
        payment.voidPayment(command.actorId(), command.reason(), Instant.now(clock)); // 이미 VOIDED 면 멱등 no-op
        long activePaid = paymentRepository.sumActiveByFeeBillId(command.billId());
        // CANCELLED 청구는 updateStatus 가 멱등 no-op 이라 정정으로 되살아나지 않는다.
        statusRefresher.refresh(bill, activePaid);

        log.info("payment voided: actorId={}, clubId={}, billId={}, paymentId={}, activePaid={}",
                command.actorId(), command.clubId(), command.billId(), command.paymentId(), activePaid);
        if (wasActive) {
            // 매칭 납부를 수기로 정정하는 경우도 있어 연결된 거래 id 를 그대로 함께 남긴다(수기 납부면 null).
            clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                    ClubAuditEventType.FEE_PAYMENT_VOIDED, command.clubId(), bill.getId(),
                    payment.getId(), payment.getBankTransactionId(), command.actorId(),
                    normalizeReason(command.reason()),
                    AuditDetailJson.of(Map.of("amount", payment.getAmount()))));
        }
    }

    /** 공백뿐인 사유는 "미입력"과 같으므로 NULL 로 수렴시킨다(총동연 강제 마감 감사와 동일 규칙). */
    private static String normalizeReason(String reason) {
        return reason == null || reason.isBlank() ? null : reason.trim();
    }

    @Override
    public List<PaymentQuery> getPayments(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        // 다른 동아리 청구는 여기서 404(cross-club 누출 차단).
        feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return paymentRepository.findByFeeBillIdOrderByCreatedAtAsc(billId).stream()
                .map(PaymentQuery::from)
                .toList();
    }
}
