package com.duing.domain.notification.repository;

import com.duing.domain.notification.entity.Notification;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, Long>, NotificationRepositoryCustom {

    boolean existsByUserIdAndDedupKey(Long userId, String dedupKey);

    long countByUserIdAndReadAtIsNull(Long userId);

    Optional<Notification> findByIdAndUserId(Long id, Long userId);
}