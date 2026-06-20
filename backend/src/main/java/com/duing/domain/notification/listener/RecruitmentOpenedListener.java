package com.duing.domain.notification.listener;

import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.support.RecruitmentDeadlineLabel;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
@Slf4j
public class RecruitmentOpenedListener {

    private final ClubFavoriteRepository favoriteRepository;
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(RecruitmentOpenedEvent event) {
        String dedupKey = "RECRUITMENT_OPENED:r=" + event.recruitmentId();
        // 학생측 모집 상세 라우트는 #98 PR 에서 제거되었다. active 모집은 동아리 상세 카드에
        // 임베드되어 노출되므로 동아리 상세로 보낸다. payload 의 recruitmentId 는 그대로 유지.
        String linkUrl = "/clubs/" + event.clubId();
        String title = "찜한 " + event.clubName() + "의 새 모집이 시작됐어요";
        String body = event.recruitmentTitle() + " · " + RecruitmentDeadlineLabel.of(event.endDate());

        favoriteRepository.findUserIdsByClubId(event.clubId()).forEach(userId -> {
            try {
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        userId,
                        NotificationType.RECRUITMENT_OPENED,
                        title,
                        body,
                        linkUrl,
                        Map.of("recruitmentId", event.recruitmentId(), "clubId", event.clubId()),
                        dedupKey));
            } catch (Exception failure) {
                log.warn("RECRUITMENT_OPENED 알림 실패: userId={}, recruitmentId={}",
                        userId, event.recruitmentId(), failure);
            }
        });
    }
}