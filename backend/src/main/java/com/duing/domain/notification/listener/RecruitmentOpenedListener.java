package com.duing.domain.notification.listener;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
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
    private final ClubRepository clubRepository;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handle(RecruitmentOpenedEvent event) {
        // AFTER_COMMIT 시점 재검증 — 생성 커밋과 fanout 사이에 동아리가 운영 중단(비 ACTIVE)으로
        // 전환됐을 수 있다. 비 ACTIVE 동아리의 모집 오픈 알림은 보내지 않는다.
        if (!clubRepository.existsByIdAndStatus(event.clubId(), ClubStatus.ACTIVE)) {
            log.debug("모집 오픈 알림 스킵 — 동아리가 운영 중이 아님. recruitmentId={}, clubId={}",
                    event.recruitmentId(), event.clubId());
            return;
        }
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