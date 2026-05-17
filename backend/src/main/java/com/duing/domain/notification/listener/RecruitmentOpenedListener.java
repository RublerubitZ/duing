package com.duing.domain.notification.listener;

import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
@RequiredArgsConstructor
public class RecruitmentOpenedListener {

    private final ClubFavoriteRepository favoriteRepository;
    private final NotificationService notificationService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(RecruitmentOpenedEvent event) {
        String dedupKey = "RECRUITMENT_OPENED:r=" + event.recruitmentId();
        String linkUrl = "/clubs/" + event.clubId() + "/recruitments/" + event.recruitmentId();
        String title = "찜한 " + event.clubName() + "의 새 모집이 시작됐어요";
        String body = event.recruitmentTitle() + " · 마감 " + event.endDate();

        favoriteRepository.findUserIdsByClubId(event.clubId()).forEach(userId ->
                notificationService.createIfAbsent(new CreateNotificationCommand(
                        userId,
                        NotificationType.RECRUITMENT_OPENED,
                        title,
                        body,
                        linkUrl,
                        Map.of("recruitmentId", event.recruitmentId(), "clubId", event.clubId()),
                        dedupKey)));
    }
}