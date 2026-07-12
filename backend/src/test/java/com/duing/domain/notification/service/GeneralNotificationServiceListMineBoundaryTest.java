package com.duing.domain.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.notice.broadcast.repository.NoticeBroadcastReadRepository;
import com.duing.domain.notice.broadcast.repository.NoticeBroadcastRepository;
import com.duing.domain.notification.controller.dto.response.NotificationResponse;
import com.duing.domain.notification.entity.Notification;
import com.duing.domain.notification.repository.NotificationRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * listMine 의 over-fetch 상한 경계 동작을 mock 으로 저비용 검증한다. 상한과 정확히 같은 요청 깊이는
 * 정확히 서빙(over-fetch = requestedFetch)하고, 상한을 1이라도 넘으면 대량 조회 없이(size 1 count) 빈
 * 목록으로 단락하는지 — `>` 를 `>=` 등으로 잘못 바꾸는 회귀를 잡는다. (MAX_MERGE_FETCH = 5000)
 */
class GeneralNotificationServiceListMineBoundaryTest {

    private static final int MAX_MERGE_FETCH = 5000; // 서비스의 private 상수와 동기화

    private final NotificationRepository notificationRepository = mock(NotificationRepository.class);
    private final NoticeBroadcastRepository broadcastRepository = mock(NoticeBroadcastRepository.class);
    private final NoticeBroadcastReadRepository broadcastReadRepository = mock(NoticeBroadcastReadRepository.class);

    private final GeneralNotificationService service = new GeneralNotificationService(
            notificationRepository, broadcastRepository, broadcastReadRepository);

    @Test
    @DisplayName("요청 깊이가 상한과 정확히 같으면(page 49, size 100 → 5000) 단락하지 않고 over-fetch=5000 으로 서빙한다")
    void requestExactlyAtCapIsServedWithFullOverFetch() {
        when(notificationRepository.findMine(anyLong(), anyBoolean(), any(Pageable.class)))
                .thenReturn(emptyPage());
        when(broadcastRepository.findSliceForUser(anyLong(), anyInt())).thenReturn(List.of());
        when(broadcastRepository.countWithinRetention()).thenReturn(0L);

        service.listMine(1L, false, PageRequest.of(49, 100)); // requestedFetch = 50 * 100 = 5000 == cap

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(notificationRepository).findMine(eq(1L), eq(false), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(MAX_MERGE_FETCH);
    }

    @Test
    @DisplayName("요청 깊이가 상한을 넘으면(page 50, size 100 → 5100) 대량 조회 없이 size 1 로 총계만 얻고 빈 목록으로 단락한다")
    void requestBeyondCapShortCircuitsWithMinimalFetch() {
        when(notificationRepository.findMine(anyLong(), anyBoolean(), any(Pageable.class)))
                .thenReturn(emptyPage());
        when(broadcastRepository.countWithinRetention()).thenReturn(0L);

        Page<NotificationResponse> result =
                service.listMine(1L, false, PageRequest.of(50, 100)); // requestedFetch = 51 * 100 = 5100 > cap

        assertThat(result.getContent()).isEmpty();
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(notificationRepository).findMine(eq(1L), eq(false), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(1);
    }

    private Page<Notification> emptyPage() {
        return new PageImpl<>(List.of(), PageRequest.of(0, 1), 0L);
    }
}
