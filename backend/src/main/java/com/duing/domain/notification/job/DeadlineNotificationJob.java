package com.duing.domain.notification.job;

import com.duing.domain.favorite.repository.ClubFavoriteRepository;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.service.NotificationService;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.recruitment.repository.DeadlineRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 매일 오전 6시(Asia/Seoul)에 실행되는 Deadline 알림 잡.
 * <ul>
 *   <li>오늘 시작하는 OPEN 모집 → RECRUITMENT_OPENED 알림 (찜한 유저에게 fan-out)</li>
 *   <li>마감 D-3 / D-1 / D-0 인 OPEN 모집 → RECRUITMENT_DEADLINE 알림 (찜한 유저에게 fan-out)</li>
 * </ul>
 * {@code duing.notification.jobs.enabled=true} 가 설정된 환경에서만 동작한다.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DeadlineNotificationJob {

    private final RecruitmentRepository recruitmentRepository;
    private final ClubFavoriteRepository favoriteRepository;
    private final NotificationService notificationService;
    private final Clock clock;

    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    @Transactional(readOnly = true)
    public void run() {
        LocalDate today = LocalDate.now(clock);
        List<DeadlineRow> candidates = recruitmentRepository.findDeadlineNotificationCandidates(today);
        log.info("DeadlineNotificationJob start: candidates={}", candidates.size());

        int created = 0;
        for (DeadlineRow row : candidates) {
            List<Long> favoringUserIds = favoriteRepository.findUserIdsByClubId(row.getClubId());
            for (Long userId : favoringUserIds) {
                try {
                    boolean inserted = "OPENED".equals(row.getKind())
                            ? notificationService.createIfAbsent(buildOpenedCommand(userId, row))
                            : notificationService.createIfAbsent(buildDeadlineCommand(userId, row));
                    if (inserted) {
                        created++;
                    }
                } catch (Exception failure) {
                    log.warn("Deadline 알림 실패: userId={}, recruitmentId={}",
                            userId, row.getRecruitmentId(), failure);
                }
            }
        }
        log.info("DeadlineNotificationJob done: created={}", created);
    }

    private CreateNotificationCommand buildOpenedCommand(Long userId, DeadlineRow row) {
        return new CreateNotificationCommand(
                userId,
                NotificationType.RECRUITMENT_OPENED,
                "찜한 " + row.getClubName() + "의 새 모집이 시작됐어요",
                row.getTitle() + " · 마감 " + row.getEndDate(),
                // 학생측 모집 상세 라우트는 #98 PR 에서 제거되었다. active 모집은 동아리 상세 카드에
                // 임베드되어 노출되므로 동아리 상세로 보낸다. payload 의 recruitmentId 는 그대로 유지.
                "/clubs/" + row.getClubId(),
                Map.of("recruitmentId", row.getRecruitmentId(), "clubId", row.getClubId()),
                "RECRUITMENT_OPENED:r=" + row.getRecruitmentId()
        );
    }

    private CreateNotificationCommand buildDeadlineCommand(Long userId, DeadlineRow row) {
        int daysToEnd = row.getDaysToEnd() == null ? 0 : row.getDaysToEnd();
        String title = switch (daysToEnd) {
            case 3 -> row.getClubName() + " 모집 마감 3일 전";
            case 1 -> row.getClubName() + " 모집 마감 하루 전";
            default -> row.getClubName() + " 모집 오늘 마감";
        };
        String body = switch (daysToEnd) {
            case 3 -> row.getTitle() + " · " + row.getEndDate();
            case 1 -> row.getTitle() + " · 내일까지";
            default -> row.getTitle();
        };
        return new CreateNotificationCommand(
                userId,
                NotificationType.RECRUITMENT_DEADLINE,
                title,
                body,
                // 학생측 모집 상세 라우트는 #98 PR 에서 제거. 동아리 상세에서 active 모집 노출됨.
                "/clubs/" + row.getClubId(),
                Map.of("recruitmentId", row.getRecruitmentId(), "clubId", row.getClubId()),
                "RECRUITMENT_DEADLINE:r=" + row.getRecruitmentId() + ":d=" + daysToEnd
        );
    }
}