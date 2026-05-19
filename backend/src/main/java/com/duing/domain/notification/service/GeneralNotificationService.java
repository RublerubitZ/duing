package com.duing.domain.notification.service;

import com.duing.domain.notice.broadcast.entity.NoticeBroadcast;
import com.duing.domain.notice.broadcast.entity.NoticeBroadcastRead;
import com.duing.domain.notice.broadcast.exception.NoticeBroadcastException;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastReadRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepositoryCustom.BroadcastSlice;
import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.service.dto.query.NotificationQuery;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralNotificationService implements NotificationService {

    private final NotificationRepository notificationRepository;
    private final NoticeBroadcastRepository broadcastRepository;
    private final NoticeBroadcastReadRepository broadcastReadRepository;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean createIfAbsent(CreateNotificationCommand command) {
        if (notificationRepository.existsByUserIdAndDedupKey(command.userId(), command.dedupKey())) {
            return false;
        }
        Notification notification = Notification.create(
                command.userId(),
                command.type(),
                command.title(),
                command.body(),
                command.linkUrl(),
                command.payload(),
                command.dedupKey()
        );
        try {
            notificationRepository.saveAndFlush(notification);
            return true;
        } catch (DataIntegrityViolationException collision) {
            return false;
        }
    }

    @Override
    public Page<NotificationResponse> listMine(Long userId, boolean unreadOnly, Pageable pageable) {
        int overFetch = (pageable.getPageNumber() + 1) * pageable.getPageSize();

        // personal: 기존 repo 사용. unreadOnly 는 기존 시그니처가 처리.
        List<NotificationResponse> personal = notificationRepository
                .findMine(userId, unreadOnly, PageRequest.of(0, overFetch, Sort.by(Sort.Direction.DESC, "createdAt")))
                .getContent().stream()
                .map(NotificationQuery::from)
                .map(NotificationResponse::from)
                .toList();

        // broadcast: 항상 over-fetch, isRead 필터는 union 단계에서.
        List<BroadcastSlice> broadcastSlices = broadcastRepository.findSliceForUser(userId, overFetch);
        List<NotificationResponse> broadcast = broadcastSlices.stream()
                .filter(slice -> !unreadOnly || !slice.isRead())
                .map(slice -> NotificationResponse.fromBroadcast(slice.broadcast(), slice.isRead()))
                .toList();

        // merge + sort
        List<NotificationResponse> merged = new ArrayList<>(personal.size() + broadcast.size());
        merged.addAll(personal);
        merged.addAll(broadcast);
        merged.sort(Comparator.comparing(NotificationResponse::createdAt).reversed());

        // page slice
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), merged.size());
        List<NotificationResponse> pageContent = start >= merged.size() ? List.of() : merged.subList(start, end);
        return new PageImpl<>(pageContent, pageable, merged.size());
    }

    @Override
    public long unreadCount(Long userId) {
        long personal = notificationRepository.countByUserIdAndReadAtIsNull(userId);
        long broadcast = broadcastRepository.countUnreadForUser(userId);
        return personal + broadcast;
    }

    @Override
    @Transactional
    public void markRead(Long userId, Long notificationId) {
        notificationRepository.findByIdAndUserId(notificationId, userId)
                .ifPresent(Notification::markRead);
    }

    @Override
    @Transactional
    public void markAllRead(Long userId) {
        notificationRepository.markAllRead(userId);
    }

    @Override
    @Transactional
    public void markBroadcastRead(Long userId, Long broadcastId) {
        boolean exists = broadcastRepository.findById(broadcastId).isPresent();
        if (!exists) throw new NoticeBroadcastException.NoticeBroadcastNotFoundException();
        if (broadcastReadRepository.existsByIdBroadcastIdAndIdUserId(broadcastId, userId)) {
            return; // 멱등
        }
        broadcastReadRepository.save(new NoticeBroadcastRead(broadcastId, userId));
    }
}
