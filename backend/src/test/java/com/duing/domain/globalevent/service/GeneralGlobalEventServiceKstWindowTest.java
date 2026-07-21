package com.duing.domain.globalevent.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.globalevent.repository.GlobalEventRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 전역(총동연) 행사 기본 조회 윈도우가 KST '오늘'을 기준으로 잡히는지 검증한다.
 * 무클럭 LocalDate.now() 는 prod(UTC) JVM 에서 KST 00~09 시에 하루 이른 날짜를 반환해
 * 기본 표시 범위가 하루 어긋난다 — seoulClock 기준으로 계산되어야 한다.
 */
class GeneralGlobalEventServiceKstWindowTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final int DEFAULT_PAST_DAYS = 30;
    private static final int DEFAULT_FUTURE_DAYS = 180;

    private final GlobalEventRepository eventRepository = mock(GlobalEventRepository.class);

    @Test
    @DisplayName("from·to 미지정 시 기본 윈도우가 KST 오늘 기준으로 계산된다")
    void defaultWindowIsAnchoredToKstToday() {
        // 상대 미래 고정 Clock — 무클럭 now() 였다면 실행 시점의 실제 오늘(≈1년 전)을 써 윈도우가 어긋난다.
        LocalDate kstToday = LocalDate.now(SEOUL).plusYears(1);
        Clock fixedClock = Clock.fixed(kstToday.atStartOfDay(SEOUL).toInstant(), SEOUL);
        GeneralGlobalEventService service = new GeneralGlobalEventService(eventRepository, fixedClock);
        when(eventRepository.findWindow(any(), any(), isNull())).thenReturn(List.of());

        service.listPublicWindow(null, null, null);

        ArgumentCaptor<LocalDateTime> fromCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        ArgumentCaptor<LocalDateTime> toCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(eventRepository).findWindow(fromCaptor.capture(), toCaptor.capture(), isNull());
        assertThat(fromCaptor.getValue().toLocalDate()).isEqualTo(kstToday.minusDays(DEFAULT_PAST_DAYS));
        assertThat(toCaptor.getValue().toLocalDate()).isEqualTo(kstToday.plusDays(DEFAULT_FUTURE_DAYS));
    }
}
