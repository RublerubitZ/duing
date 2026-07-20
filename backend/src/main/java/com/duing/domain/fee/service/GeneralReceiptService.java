package com.duing.domain.fee.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.controller.dto.response.ReceiptResponse;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralReceiptService implements ReceiptService {

    private static final DateTimeFormatter RECEIPT_YEAR_MONTH = DateTimeFormatter.ofPattern("yyyyMM");

    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final FeePolicyRepository feePolicyRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final ClubAuthService clubAuthService;
    private final Clock clock; // Asia/Seoul — issuedAt(now)

    @Override
    public ReceiptResponse getMemberReceipt(Long userId, Long billId) {
        FeeBill bill = feeBillRepository.findByIdAndUserId(billId, userId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return buildReceipt(bill);
    }

    @Override
    public ReceiptResponse getClubReceipt(Long clubId, Long actorId, Long billId) {
        clubAuthService.requireManager(actorId, clubId);
        FeeBill bill = feeBillRepository.findByIdAndClubId(billId, clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        return buildReceipt(bill);
    }

    private ReceiptResponse buildReceipt(FeeBill bill) {
        List<Payment> activePayments = paymentRepository.findByFeeBillIdOrderByCreatedAtAsc(bill.getId()).stream()
                .filter(Payment::isActive)
                .toList();
        // 발급 가드: 취소 청구이거나 ACTIVE 납부가 0건이면 발급 불가(부분 납부 OVERDUE 는 발급 가능).
        if (bill.getStatus() == FeeStatus.CANCELLED || activePayments.isEmpty()) {
            throw new FeeBillException.ReceiptUnavailableException();
        }
        long paidTotal = activePayments.stream().mapToLong(Payment::getAmount).sum();
        String memberName = userRepository.findById(bill.getUserId()).map(User::getName).orElse("회원");
        String clubName = clubRepository.findById(bill.getClubId()).map(Club::getName).orElse("동아리");
        String policyName = feePolicyRepository.findById(bill.getFeePolicyId())
                .map(FeePolicy::getName).orElse("회비");
        String receiptNumber = "RCP-" + bill.getBillingStartDate().format(RECEIPT_YEAR_MONTH) + "-" + bill.getId();

        return new ReceiptResponse(
                receiptNumber, clubName, memberName, policyName, bill.getBillingPeriod(),
                bill.getBillingStartDate(), bill.getBillingEndDate(), bill.getDueDate(),
                bill.getAmount(), paidTotal, bill.getAmount() - paidTotal, activePayments.size(),
                bill.getStatus(), Instant.now(clock),
                activePayments.stream()
                        // paid_at 은 KST 벽시계 계열(수기 납부 atStartOfDay(SEOUL)·BANK 매칭 transactionAt) — seoul 변환.
                        .map(payment -> new ReceiptResponse.PaymentLine(
                                payment.getAmount(), payment.getMethod(),
                                TimeMapper.seoulWallClockToInstant(payment.getPaidAt()), payment.getMemo()))
                        .toList());
    }
}
