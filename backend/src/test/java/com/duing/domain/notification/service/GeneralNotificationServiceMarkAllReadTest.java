package com.duing.domain.notification.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.duing.domain.notice.broadcast.repository.NoticeBroadcastReadRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notification.repository.NotificationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 모두 읽음이 전체 알림 일괄 삽입에 넘기는 30일 경계가 저장 존(JVM 기본 존) 기준인지 본다(#1765).
 * 시계 존을 로컬(KST)·CI(UTC) 어느 쪽과도 다른 UTC+14 로 고정해, 경계를 시계 존 벽시계로 만드는 실수를 어느 JVM 에서든 잡는다.
 */
class GeneralNotificationServiceMarkAllReadTest {

    private static final Instant NOW = Instant.parse("2026-11-22T03:00:00Z");
    private static final ZoneId CLOCK_ZONE = ZoneId.of("Pacific/Kiritimati");

    private final NotificationRepository notificationRepository = mock(NotificationRepository.class);
    private final NoticeBroadcastReadRepository broadcastReadRepository = mock(NoticeBroadcastReadRepository.class);

    private final GeneralNotificationService service = new GeneralNotificationService(
            notificationRepository, mock(NoticeBroadcastRepository.class), broadcastReadRepository,
            Clock.fixed(NOW, CLOCK_ZONE));

    @Test
    @DisplayName("모두 읽음은 개인 알림을 읽음으로 바꾸고, 전체 알림 일괄 삽입에는 저장 존 기준 30일 경계를 넘긴다")
    void markAllReadPassesSystemZoneRetentionFloorToBroadcastReads() {
        service.markAllRead(1L);

        verify(notificationRepository).markAllRead(1L);
        verify(broadcastReadRepository).bulkInsertVisibleBroadcastReads(
                1L, LocalDateTime.ofInstant(NOW, ZoneId.systemDefault()).minusDays(30));
    }
}
