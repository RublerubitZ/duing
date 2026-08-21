package com.duing.domain.fee.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
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
public class GeneralMatchedPaymentService implements MatchedPaymentService {

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final BankTransactionRepository bankTransactionRepository;
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final FeeBillStatusRefresher statusRefresher;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public void createMatchedPayment(Long bankTransactionId, Long clubId, Long feeBillId, Long actorId,
                                     MatchStatus matchStatus, boolean autoMatched, boolean allowPartial) {
        // 거래는 id 로 받아 이 트랜잭션에 영속된 인스턴스를 비관적 잠금으로 조회한다(동아리 격리 포함).
        // 거래 행 잠금으로 같은 입금을 서로 다른 청구로 동시 매칭하려는 호출들이 직렬화되어 한 입금의 이중 소비를 막는다.
        BankTransaction transaction = bankTransactionRepository.findByIdAndClubIdForUpdate(bankTransactionId, clubId)
                .orElseThrow(BankMatchingException.BankTransactionNotFoundException::new);
        if (!transaction.isPending()) {
            // 거래 잠금을 먼저 획득한 호출이 커밋한 뒤 두 번째 호출이 여기 도달 → 이미 매칭/무시된 거래이므로 중단.
            throw new BankMatchingException.AlreadyMatchedException();
        }
        // 비관적 잠금: 같은 청구에 대한 동시 수동 납부·매칭이 잔액 검증과 합계 산출을 직렬화하도록 한다(거래의 동아리로 격리).
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(feeBillId, transaction.getClubId())
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        if (bill.getStatus() == FeeStatus.CANCELLED) {
            // 후보 조회 후 청구 잠금을 얻기 전에 청구가 취소·커밋됐을 수 있다. 취소된 청구에 활성 납부가
            // 붙고 updateStatus 가 CANCELLED 가드로 no-op 되어 거짓 "확인" 알림이 나가는 것을 막는다.
            throw new BankMatchingException.BillNotMatchableException();
        }
        long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
        long remaining = bill.remainingAfter(activePaid);
        if (transaction.getAmount() > remaining) {
            // 초과 입금은 부분 매칭이라도 항상 거부한다(잔액을 넘는 납부 기록·음수 잔액을 막는다).
            throw new BankMatchingException.MatchAmountMismatchException();
        }
        if (!allowPartial && transaction.getAmount() != remaining) {
            // 자동/정확 매칭은 잔액과 정확히 일치해야 한다. 동시성으로 잔액이 변동돼 불일치하면 검토 큐로 보낸다.
            throw new BankMatchingException.MatchAmountMismatchException();
        }

        // 입금액을 그대로 적용한다(부분 매칭이면 잔액 미만, 정확 매칭이면 잔액과 동일).
        long appliedAmount = transaction.getAmount();
        Payment payment = paymentRepository.save(Payment.record(
                bill.getId(), appliedAmount, PaymentMethod.TRANSFER, transaction.getTransactionAt(), actorId, "BANK 매칭"));
        payment.linkBankTransaction(transaction.getId());

        long newSum = activePaid + appliedAmount;
        FeeStatus newStatus = statusRefresher.refresh(bill, newSum);
        transaction.matchTo(bill.getId(), matchStatus);

        eventPublisher.publishEvent(new FeePaymentConfirmedEvent(
                bill.getUserId(), bill.getId(), bill.getBillingPeriod(), newStatus,
                bill.remainingAfter(newSum), payment.getId(), autoMatched));

        log.info("matched payment created: actorId={}, clubId={}, billId={}, paymentId={}, txId={}, "
                        + "amount={}, matchStatus={}, autoMatched={}, allowPartial={}, newStatus={}",
                actorId, transaction.getClubId(), bill.getId(), payment.getId(), transaction.getId(),
                appliedAmount, matchStatus, autoMatched, allowPartial, newStatus);
        // 자동매칭·수동 승인이 모두 이 메서드를 타므로 납부 기록 감사는 여기 한 곳이면 두 경로가 커버된다.
        // 자동매칭도 동기화를 트리거한 운영진이 actor 라 actorId 는 항상 사람이다(시스템 잡 경로 없음).
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_RECORDED, transaction.getClubId(), bill.getId(),
                payment.getId(), transaction.getId(), actorId, null,
                AuditDetailJson.of(Map.of("amount", appliedAmount, "autoMatched", autoMatched))));
    }
}
