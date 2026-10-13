package com.duing.domain.notification.listener;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.ApplicationSubmittedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.support.OperatorNotificationSupport;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 지원서 접수 알림 — 동아리 운영진(회장·임원)에게 모집 × 운영진 × 하루(KST) 1건.
 * 학기 초 인기 동아리는 하루 수십 건이 들어와 건별 알림은 목록을 덮으므로, 그날 첫 지원서만 알리고 나머지는 지원 현황에서 본다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class ApplicationSubmittedListener {

    private final ClubMemberRepository clubMemberRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    // RecruitmentOpenedListener 의 주석대로 이 메서드에 @Transactional 을 붙이지 않는다 —
    // createIfAbsent 가 REQUIRES_NEW 로 자기 트랜잭션을 연다.
    // AFTER_COMMIT 예외는 원 요청으로 전파돼 이미 커밋된 제출이 500 이 되므로, 운영진 조회까지 포함해 전체를 감싼다.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(ApplicationSubmittedEvent event) {
        try {
            String dedupKey = "APPLICATION_RECEIVED:r=" + event.recruitmentId() + ":on=" + LocalDate.now(clock);
            String linkUrl = OperatorNotificationSupport.applicantsLink(event.clubId(), event.recruitmentId());
            String body = OperatorNotificationSupport.truncateBody(
                    event.recruitmentTitle() + " · 오늘 들어온 지원서는 지원 현황에서 확인할 수 있어요");
            for (Long officerUserId : clubMemberRepository.findOfficerUserIdsByClubIdIn(List.of(event.clubId()))) {
                // 지금 제출 경로는 운영진의 자기 동아리 지원을 막지만, 방어선으로 지원자 본인은 뺀다.
                if (officerUserId.equals(event.applicantUserId())) {
                    continue;
                }
                try {
                    notificationService.createIfAbsent(new CreateNotificationCommand(
                            officerUserId, NotificationType.APPLICATION_RECEIVED, "새 지원서가 접수됐어요", body, linkUrl,
                            Map.of("recruitmentId", event.recruitmentId(), "clubId", event.clubId()), dedupKey));
                } catch (Exception failure) {
                    log.warn("APPLICATION_RECEIVED 알림 실패: userId={}, recruitmentId={}",
                            officerUserId, event.recruitmentId(), failure);
                }
            }
        } catch (Exception failure) {
            log.warn("APPLICATION_RECEIVED 알림 처리 실패: recruitmentId={}", event.recruitmentId(), failure);
        }
    }
}
