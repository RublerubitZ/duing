package com.duing.domain.fee.service;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.repository.ClubAuditEventRepository;
import com.duing.domain.clubaudit.support.AuditDetailJson;
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
import com.duing.domain.fee.repository.MatchCandidate;
import com.duing.domain.fee.repository.MatchedBillInfo;
import com.duing.domain.fee.repository.PaymentRepository;
import com.duing.domain.fee.service.dto.query.BankTransactionView;
import java.time.Clock;
import java.time.Instant;
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
    private final ClubAuditEventRepository clubAuditEventRepository;
    private final BankMatchingAdminService bankMatchingAdminService;
    private final MatchedPaymentService matchedPaymentService;
    private final FeeBillStatusRefresher statusRefresher;
    private final Clock clock;

    @Override
    public boolean isMatchingEnabled(Long clubId, Long actorId) {
        clubAuthService.requireManager(actorId, clubId);
        return bankMatchingAdminService.isActiveUsable(clubId);
    }

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

        // 후보 청구는 입금액이 같으면 결과도 같다 — 페이지의 PENDING 금액을 중복 없이 모아 한 번에 조회한다(N+1 방지).
        List<Long> pendingAmounts = page.getContent().stream()
                .filter(BankTransaction::isPending)
                .map(BankTransaction::getAmount)
                .distinct()
                .toList();
        // 후보의 remaining 은 조회 조건상 입금액과 정확히 같으므로 분배 키로 그대로 쓴다. groupingBy 의 기본
        // 다운스트림(toList)은 스트림 순서를 보존해 금액 그룹 안의 dueDate 오름차순 정렬이 그대로 유지된다.
        Map<Long, List<MatchCandidate>> candidatesByAmount =
                feeBillRepository.findMatchCandidates(clubId, pendingAmounts).stream()
                        .collect(Collectors.groupingBy(MatchCandidate::remaining));

        return page.map(transaction -> {
            if (transaction.isPending()) {
                // 후보 청구는 검토가 필요한 PENDING 입금에만 동봉한다(이미 매칭·무시된 거래는 후보 없음).
                return BankTransactionView.pending(
                        transaction, candidatesByAmount.getOrDefault(transaction.getAmount(), List.of()));
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
        // 거래 잠금·PENDING 확인·청구 잠금·상태 가드·잔액 재계산은 전부 createMatchedPayment 한 곳에 맡긴다.
        // (과거의 사전검증 사본은 같은 TX 재진입이라 통과 후 내부 검증이 한 번 더 돌던 중복 왕복이었다.)
        // 수동 승인: MANUAL_MATCHED·autoMatched=false → 표준 "확인"/부분 납부 알림 문구,
        // allowPartial=true → 입금액 ≤ 잔액이면 부분 납부로 적용.
        try {
            matchedPaymentService.createMatchedPayment(
                    txId, clubId, feeBillId, actorId, MatchStatus.MANUAL_MATCHED, false, true);
        } catch (FeeBillException.FeeBillNotFoundException
                 | BankMatchingException.BillNotMatchableException
                 | BankMatchingException.MatchAmountMismatchException candidateRejection) {
            // 수동 승인 계약 보존: 청구 축 부적격(없음·타 동아리·취소·완납·잔액 초과)은 종전대로
            // "매칭 후보 아님" 400 으로 수렴한다. 거래 축(AlreadyMatched 409·BankTransactionNotFound 404)은 그대로 전파.
            throw new BankMatchingException.InvalidMatchCandidateException();
        }

        log.info("bank transaction approved: actorId={}, clubId={}, txId={}, feeBillId={}",
                actorId, clubId, txId, feeBillId);
        // 납부 기록 감사(FEE_PAYMENT_RECORDED)는 createMatchedPayment 가 남긴다 — 여기서는 수기 매칭 행위만 남긴다.
        clubAuditEventRepository.save(ClubAuditEvent.feeTransaction(
                ClubAuditEventType.FEE_TX_MANUAL_MATCHED, clubId, txId, feeBillId, actorId));
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
        // 무시는 대상 청구가 없다(feeBillId=null). 이미 무시된 거래는 위에서 409 로 빠져 중복 기록되지 않는다.
        clubAuditEventRepository.save(ClubAuditEvent.feeTransaction(
                ClubAuditEventType.FEE_TX_IGNORED, clubId, txId, null, actorId));
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

        payment.voidPayment(actorId, UNMATCH_REASON, Instant.now(clock));
        long activePaid = paymentRepository.sumActiveByFeeBillId(bill.getId());
        FeeStatus newStatus = statusRefresher.refresh(bill, activePaid);
        transaction.resetToPending();

        // 매칭취소는 납부 정정을 엔티티에서 직접 호출해 GeneralPaymentService 계측을 타지 않으므로,
        // 거래 매칭취소와 납부 정정 두 건을 여기서 함께 남긴다(스펙 §4). 동시 정정으로 이미 VOIDED 인
        // 경우는 위 재조회에서 예외로 빠지므로 이 지점에는 실제 전이가 일어난 호출만 도달한다.
        clubAuditEventRepository.save(ClubAuditEvent.feeTransaction(
                ClubAuditEventType.FEE_TX_UNMATCHED, clubId, txId, bill.getId(), actorId));
        clubAuditEventRepository.save(ClubAuditEvent.feePayment(
                ClubAuditEventType.FEE_PAYMENT_VOIDED, clubId, bill.getId(), payment.getId(),
                txId, actorId, UNMATCH_REASON, AuditDetailJson.of(Map.of("amount", payment.getAmount()))));

        log.info("bank transaction unmatched: actorId={}, clubId={}, txId={}, billId={}, paymentId={}, newStatus={}",
                actorId, clubId, txId, bill.getId(), payment.getId(), newStatus);
    }
}
