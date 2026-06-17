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
import lombok.extern.slf4j.Slf4j;
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
    private final FeeBillStatusCalculator statusCalculator;
    private final FeePaymentNotifier notifier;
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
        long remaining = bill.getAmount() - activePaid;
        if (command.amount() > remaining) {
            throw new PaymentException.PaymentExceedsRemainingException();
        }

        LocalDateTime paidAt = command.paidAt().atStartOfDay(SEOUL).toLocalDateTime();
        Payment payment = paymentRepository.save(Payment.record(
                command.billId(), command.amount(), command.method(), paidAt, command.actorId(), command.memo()));

        long newSum = activePaid + command.amount();
        FeeStatus newStatus = statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), newSum);
        bill.updateStatus(newStatus);
        notifier.notifyPaymentConfirmed(bill, newStatus, bill.getAmount() - newSum, payment.getId());

        log.info("payment recorded: actorId={}, clubId={}, billId={}, paymentId={}, amount={}, newStatus={}",
                command.actorId(), command.clubId(), command.billId(), payment.getId(), command.amount(), newStatus);
        return payment.getId();
    }

    @Override
    @Transactional
    public void voidPayment(Long clubId, Long actorId, Long billId, Long paymentId, String reason) {
        clubAuthService.requireManager(actorId, clubId);
        // 정정도 같은 청구 행을 비관적 잠금해 동시 납부 기록과 합계 재계산을 직렬화한다.
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        Payment payment = paymentRepository.findByIdAndFeeBillId(paymentId, billId)
                .orElseThrow(PaymentException.PaymentNotFoundException::new);

        payment.voidPayment(actorId, reason, LocalDateTime.now(clock)); // 이미 VOIDED 면 멱등 no-op
        long activePaid = paymentRepository.sumActiveByFeeBillId(billId);
        // CANCELLED 청구는 updateStatus 가 멱등 no-op 이라 정정으로 되살아나지 않는다.
        bill.updateStatus(statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), activePaid));

        log.info("payment voided: actorId={}, clubId={}, billId={}, paymentId={}, activePaid={}",
                actorId, clubId, billId, paymentId, activePaid);
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
