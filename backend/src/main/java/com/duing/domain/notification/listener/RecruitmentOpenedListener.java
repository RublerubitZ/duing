package com.duing.domain.notification.listener;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.event.RecruitmentOpenedEvent;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.support.RecruitmentOpenedNotification;
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
        // 배치 경로는 후보 SQL(RecruitmentRepository#findDeadlineNotificationCandidates)의
        // c.status = 'ACTIVE' 가 같은 규칙을 건다 — 두 경로 모두 ACTIVE 동아리만 발송한다.
        // (모집 자체의 삭제·마감은 이 창에서 재검사하지 않는다 — 생성 직후라 창이 매우 좁은,
        //  후보 SQL 대비 알려진 소규모 비대칭이다.)
        if (!clubRepository.existsByIdAndStatus(event.clubId(), ClubStatus.ACTIVE)) {
            log.debug("모집 오픈 알림 스킵 — 동아리가 운영 중이 아님. recruitmentId={}, clubId={}",
                    event.recruitmentId(), event.clubId());
            return;
        }

        favoriteRepository.findUserIdsByClubId(event.clubId()).forEach(userId -> {
            try {
                notificationService.createIfAbsent(
                        RecruitmentOpenedNotification.commandFor(userId, event));
            } catch (Exception failure) {
                log.warn("RECRUITMENT_OPENED 알림 실패: userId={}, recruitmentId={}",
                        userId, event.recruitmentId(), failure);
            }
        });
    }
}
