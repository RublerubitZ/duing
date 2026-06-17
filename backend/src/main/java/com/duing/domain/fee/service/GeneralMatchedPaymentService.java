package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentMethod;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.notification.event.FeePaymentConfirmedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralMatchedPaymentService implements MatchedPaymentService {

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final BankTransactionRepository bankTransactionRepository;
    private final FeeBillStatusCalculator statusCalculator;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public void createMatchedPayment(BankTransaction tx, Long feeBillId, Long actorId,
                                     MatchStatus matchStatus, boolean autoMatched) {
        // 호출 측이 넘긴 거래가 다른 영속성 컨텍스트의 detached 엔티티일 수 있으므로, 이 트랜잭션에 영속된
        // 인스턴스를 비관적 잠금으로 다시 조회해 matchTo() 변경이 확실히 flush 되게 한다(동아리 격리도 함께).
        // 거래 행 잠금으로 같은 입금을 서로 다른 청구로 동시 매칭하려는 호출들이 직렬화되어 한 입금의 이중 소비를 막는다.
        BankTransaction transaction = bankTransactionRepository.findByIdAndClubIdForUpdate(tx.getId(), tx.getClubId())
                .orElseThrow(BankMatchingException.BankTransactionNotFoundException::new);
        if (!transaction.isPending()) {
            // 거래 잠금을 먼저 획득한 호출이 커밋한 뒤 두 번째 호출이 여기 도달 → 이미 매칭/무시된 거래이므로 중단.
            throw new BankMatchingException.AlreadyMatchedException();
        }
        // 비관적 잠금: 같은 청구에 대한 동시 수동 납부·매칭이 잔액 검증과 합계 산출을 직렬화하도록 한다(거래의 동아리로 격리).
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(feeBillId, transaction.getClubId())
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
        long remaining = bill.getAmount() - activePaid;
        if (remaining != transaction.getAmount()) {
            // 동시성: 잠금 획득 사이에 잔액이 변동되어 더 이상 정확히 일치하지 않음 → 자동 매칭 불가(검토 큐로).
            throw new BankMatchingException.MatchAmountMismatchException();
        }

        Payment payment = paymentRepository.save(Payment.record(
                bill.getId(), remaining, PaymentMethod.TRANSFER, transaction.getTransactionAt(), actorId, "BANK 매칭"));
        payment.linkBankTransaction(transaction.getId());

        long newSum = activePaid + remaining;
        FeeStatus newStatus = statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), newSum);
        bill.updateStatus(newStatus);
        transaction.matchTo(bill.getId(), matchStatus);

        eventPublisher.publishEvent(new FeePaymentConfirmedEvent(
                bill.getUserId(), bill.getId(), bill.getBillingPeriod(), newStatus,
                bill.getAmount() - newSum, payment.getId(), autoMatched));

        log.info("matched payment created: actorId={}, clubId={}, billId={}, paymentId={}, txId={}, "
                        + "amount={}, matchStatus={}, autoMatched={}, newStatus={}",
                actorId, transaction.getClubId(), bill.getId(), payment.getId(), transaction.getId(),
                remaining, matchStatus, autoMatched, newStatus);
    }
}
