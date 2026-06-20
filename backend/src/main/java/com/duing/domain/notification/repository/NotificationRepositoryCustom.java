package com.duing.domain.notification.repository;

import com.duing.domain.notification.entity.Notification;
import java.time.LocalDateTime;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface NotificationRepositoryCustom {

    Page<Notification> findMine(Long userId, boolean unreadOnly, Pageable pageable);

    long countUnreadWithinRetention(Long userId);

    int markAllRead(Long userId);

    int deleteCreatedBefore(LocalDateTime cutoff);
}
