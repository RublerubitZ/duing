package com.duing.domain.notification.listener;

import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.FeeBillsIssuedEvent;
import com.duing.domain.notification.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class FeeBillsIssuedListener {

    private final NotificationRepository notificationRepository;

    // AFTER_COMMIT 은 원 트랜잭션이 이미 커밋된 뒤라 @Modifying 실행에 새 트랜잭션이 필요하다
    // (벌크 전환 전에는 createIfAbsent 의 REQUIRES_NEW 가 그 역할을 했다). 이벤트당 트랜잭션 1개.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void handle(FeeBillsIssuedEvent event) {
        String title = event.clubName() + " 회비가 청구되었어요";
        String body = event.billingPeriod() + " · 마감 " + event.dueDate();

        // 실패 시멘틱: 수신자별 격리(1명 실패해도 나머지는 발송)에서 이벤트 단위 all-or-nothing 으로 바뀐다.
        // 주 실패 모드인 중복 발송은 ON CONFLICT DO NOTHING 이 행 단위로 흡수하므로(이미 알림이 있는
        // 청구는 스킵, 나머지는 정상 삽입) 격리가 필요한 상황이 실질적으로 남지 않는다. 그 밖의 실패는
        // 여기서 삼켜 알림 실패가 회비 발행 요청을 깨지 않는 기존 계약을 유지한다.
        try {
            int inserted = notificationRepository.bulkInsertFeeBillIssued(
                    NotificationType.FEE_BILL_ISSUED.name(), title, body, "/me/fees",
                    event.clubId(), event.feePolicyId(), event.billingStartDate());
            log.debug("FEE_BILL_ISSUED 알림 fan-out: clubId={}, policyId={}, period={}, inserted={}",
                    event.clubId(), event.feePolicyId(), event.billingPeriod(), inserted);
        } catch (Exception failure) {
            log.warn("회비 발행 알림 실패: clubId={}, policyId={}, period={}",
                    event.clubId(), event.feePolicyId(), event.billingPeriod(), failure);
        }
    }
}
