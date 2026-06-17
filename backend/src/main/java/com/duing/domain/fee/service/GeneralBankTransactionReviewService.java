package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.entity.BankTransaction;
import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.Payment;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.exception.BankMatchingException;
import com.duing.domain.fee.exception.FeeBillException;
import com.duing.domain.fee.repository.BankTransactionRepository;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.MatchedBillInfo;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.fee.service.dto.query.BankTransactionView;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralBankTransactionReviewService implements BankTransactionReviewService {

    private static final String UNMATCH_REASON = "매칭취소";

    private final BankTransactionRepository bankTransactionRepository;
    private final FeeBillRepository feeBillRepository;
    private final PaymentRepository paymentRepository;
    private final ClubAuthService clubAuthService;
    private final MatchedPaymentService matchedPaymentService;
    private final FeeBillStatusCalculator statusCalculator;
    private final Clock clock;

    @Override
    public Page<BankTransactionView> list(Long clubId, Long actorId, MatchStatus status, Pageable pageable) {
        clubAuthService.requireManager(actorId, clubId);
        Page<BankTransaction> page =
                bankTransactionRepository.findByClubIdAndMatchStatusOrderByTransactionAtDesc(clubId, status, pageable);

        // 매칭된(AUTO/MANUAL + matchedFeeBillId 존재) 거래의 매칭 회원 이름·회차를 한 번에 모아둔다(N+1 방지).
        // 총무가 입금자명(counterparty)과 대조해 오매칭을 잡도록 매칭 내역에 표시할 정보다.
        // IGNORED 거래는 matchedFeeBillId 가 null 이라 여기서 자연히 제외된다(매칭 정보를 채울 게 없다).
        List<Long> matchedFeeBillIds = page.getContent().stream()
                .filter(transaction -> transaction.getMatchedFeeBillId() != null)
                .map(BankTransaction::getMatchedFeeBillId)
                .toList();
        Map<Long, MatchedBillInfo> matchedInfoByBillId =
                feeBillRepository.findMatchedBillInfo(clubId, matchedFeeBillIds).stream()
                        .collect(Collectors.toMap(MatchedBillInfo::feeBillId, Function.identity()));

        return page.map(transaction -> {
            if (transaction.isPending()) {
                // 후보 청구는 검토가 필요한 PENDING 입금에만 동봉한다(이미 매칭·무시된 거래는 후보 없음).
                return BankTransactionView.pending(
                        transaction, feeBillRepository.findMatchCandidates(clubId, transaction.getAmount()));
            }
            // 매칭된 거래는 회원 이름·회차를 채운다. IGNORED(matchedFeeBillId=null) 또는 청구가 사라진 경우는
            // get(null)/미스로 matchedInfo 가 null 이라 이름·회차가 null 로 남는다.
            MatchedBillInfo matchedInfo = matchedInfoByBillId.get(transaction.getMatchedFeeBillId());
            String matchedMemberName = matchedInfo != null ? matchedInfo.memberName() : null;
            String matchedBillingPeriod = matchedInfo != null ? matchedInfo.billingPeriod() : null;
            return BankTransactionView.matched(transaction, matchedMemberName, matchedBillingPeriod);
        });
    }

    @Override
    @Transactional
    public void approve(Long clubId, Long actorId, Long txId, Long feeBillId) {
        clubAuthService.requireManager(actorId, clubId);
        // 거래를 잠근 채 후보 검증을 수행한다(ignore/unmatch 와 일관). approve 는 @Transactional 이고
        // createMatchedPayment 가 같은 거래를 다시 잠그지만 같은 트랜잭션에 재진입하므로 재잠금은 안전하다.
        BankTransaction transaction = bankTransactionRepository.findByIdAndClubIdForUpdate(txId, clubId)
                .orElseThrow(BankMatchingException.BankTransactionNotFoundException::new);
        if (!transaction.isPending()) {
            throw new BankMatchingException.AlreadyMatchedException();
        }
        // 선택한 청구가 실제 매칭 후보(잔액=입금액·같은 동아리·미납)인지 검증한다. 후보가 아니면 400.
        boolean isCandidate = feeBillRepository.findMatchCandidates(clubId, transaction.getAmount()).stream()
                .anyMatch(candidate -> candidate.feeBillId().equals(feeBillId));
        if (!isCandidate) {
            throw new BankMatchingException.InvalidMatchCandidateException();
        }
        // 실제 납부·상태 전이는 BE-5a 의 매칭 납부 생성에 위임한다(거래 재잠금·PENDING 재확인·잔액 재검증 포함).
        // 수동 승인이므로 MANUAL_MATCHED·autoMatched=false → 표준 "확인" 알림 문구로 발송된다.
        matchedPaymentService.createMatchedPayment(transaction, feeBillId, actorId, MatchStatus.MANUAL_MATCHED, false);

        log.info("bank transaction approved: actorId={}, clubId={}, txId={}, feeBillId={}",
                actorId, clubId, txId, feeBillId);
    }

    @Override
    @Transactional
    public void ignore(Long clubId, Long actorId, Long txId) {
        clubAuthService.requireManager(actorId, clubId);
        BankTransaction transaction = bankTransactionRepository.findByIdAndClubIdForUpdate(txId, clubId)
                .orElseThrow(BankMatchingException.BankTransactionNotFoundException::new);
        if (!transaction.isPending()) {
            // 이미 매칭/무시된 거래는 그냥 무시하면 납부·청구 상태가 어긋난다 → 매칭된 건은 먼저 매칭취소를 거쳐야 한다.
            throw new BankMatchingException.AlreadyMatchedException();
        }
        transaction.ignore();

        log.info("bank transaction ignored: actorId={}, clubId={}, txId={}", actorId, clubId, txId);
    }

    @Override
    @Transactional
    public void unmatch(Long clubId, Long actorId, Long txId) {
        clubAuthService.requireManager(actorId, clubId);
        BankTransaction transaction = bankTransactionRepository.findByIdAndClubIdForUpdate(txId, clubId)
                .orElseThrow(BankMatchingException.BankTransactionNotFoundException::new);
        MatchStatus matchStatus = transaction.getMatchStatus();
        if (matchStatus != MatchStatus.AUTO_MATCHED && matchStatus != MatchStatus.MANUAL_MATCHED) {
            throw new BankMatchingException.NotMatchedException();
        }

        // 연결된 활성 납부를 정정(VOID)하고 청구 상태를 재산출한다(Sprint 2 정정 경로와 동일: 청구 잠금·void·재계산).
        // 1차 조회는 잠글 청구를 알아내기 위함이다.
        Payment lookup = paymentRepository.findByBankTransactionIdAndStatus(txId, PaymentStatus.ACTIVE)
                .orElseThrow(BankMatchingException.MatchedPaymentNotFoundException::new);
        FeeBill bill = feeBillRepository.findByIdAndClubIdForUpdate(lookup.getFeeBillId(), clubId)
                .orElseThrow(FeeBillException.FeeBillNotFoundException::new);
        // 청구 잠금 획득 후 활성 납부를 재조회한다. 동시 수동 정정이 먼저 커밋됐다면 여기서 VOIDED 로 보여
        // 매칭취소가 멱등 no-op 처리되어 기존 정정 메타데이터(voidedBy/voidedAt/reason)를 덮어쓰지 않는다.
        Payment payment = paymentRepository.findByBankTransactionIdAndStatus(txId, PaymentStatus.ACTIVE)
                .orElseThrow(BankMatchingException.MatchedPaymentNotFoundException::new);

        payment.voidPayment(actorId, UNMATCH_REASON, LocalDateTime.now(clock));
        long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
        FeeStatus newStatus = statusCalculator.calculate(bill.getAmount(), bill.getDueDate(), activePaid);
        bill.updateStatus(newStatus);
        transaction.resetToPending();

        log.info("bank transaction unmatched: actorId={}, clubId={}, txId={}, billId={}, paymentId={}, newStatus={}",
                actorId, clubId, txId, bill.getId(), payment.getId(), newStatus);
    }
}
