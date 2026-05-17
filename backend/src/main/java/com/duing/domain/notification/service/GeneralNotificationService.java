package com.duing.domain.notification.service;

import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.repository.NotificationRepository;
import com.duing.domain.notification.service.dto.command.CreateNotificationCommand;
import com.duing.domain.notification.service.dto.query.NotificationQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralNotificationService implements NotificationService {

    private final NotificationRepository notificationRepository;

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
    public Page<NotificationQuery> listMine(Long userId, boolean unreadOnly, Pageable pageable) {
        return notificationRepository.findMine(userId, unreadOnly, pageable)
                .map(NotificationQuery::from);
    }

    @Override
    public long unreadCount(Long userId) {
        return notificationRepository.countByUserIdAndReadAtIsNull(userId);
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
}
