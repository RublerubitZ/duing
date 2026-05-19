package com.duing.domain.notice.broadcast.service;

import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.exception.NoticeException;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.entity.NotificationType;
import com.duing.domain.notification.repository.NotificationRepository;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GeneralNoticeBroadcaster implements NoticeBroadcaster {

    public static final int RECIPIENT_LIMIT = 2000;

    private final NoticeBroadcastRepository broadcastRepository;
    private final NotificationRepository notificationRepository;
    private final ClubMemberRepository clubMemberRepository;

    @Override
    public void publish(Notice notice, List<Long> targetClubIds) {
        switch (notice.getVisibility()) {
            case PUBLIC -> publishPublic(notice);
            case OFFICERS_ALL -> fanOutToOfficersAll(notice);
            case CLUB_SCOPED -> fanOutToClubScope(notice, targetClubIds);
        }
    }

    private void publishPublic(Notice notice) {
        if (!notice.isNotifyOnPublish()) return;
        broadcastRepository.save(NoticeBroadcast.snapshot(
                notice.getId(), notice.getTitle(), notice.getSummary(), buildLinkUrl(notice.getId())));
    }

    private void fanOutToOfficersAll(Notice notice) {
        List<Long> recipients = clubMemberRepository.findAllOfficerUserIds();
        guardLimit(recipients.size());
        bulkInsertNotifications(notice, recipients);
    }

    private void fanOutToClubScope(Notice notice, List<Long> targetClubIds) {
        List<Long> recipients = notice.getClubScopeRole() == NoticeClubScopeRole.OFFICERS_ONLY
                ? clubMemberRepository.findOfficerUserIdsByClubIdIn(targetClubIds)
                : clubMemberRepository.findUserIdsByClubIdIn(targetClubIds);
        guardLimit(recipients.size());
        bulkInsertNotifications(notice, recipients);
    }

    private void guardLimit(int count) {
        if (count > RECIPIENT_LIMIT) {
            throw new NoticeException.RecipientLimitExceededException(count, RECIPIENT_LIMIT);
        }
    }

    private void bulkInsertNotifications(Notice notice, List<Long> recipients) {
        if (recipients.isEmpty()) return;
        String dedupKey = "notice:" + notice.getId();
        String linkUrl = buildLinkUrl(notice.getId());
        Map<String, Object> payload = Map.of(
                "noticeId", notice.getId(),
                "visibility", notice.getVisibility().name());
        List<Notification> rows = recipients.stream()
                .map(userId -> Notification.create(
                        userId, NotificationType.NOTICE_TARGETED,
                        notice.getTitle(), notice.getSummary(),
                        linkUrl, payload, dedupKey))
                .toList();
        notificationRepository.saveAll(rows);
    }

    private static String buildLinkUrl(Long noticeId) {
        return "/notices/" + noticeId;
    }
}
