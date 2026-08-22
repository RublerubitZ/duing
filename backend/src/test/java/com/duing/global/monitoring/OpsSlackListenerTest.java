package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpsSlackListenerTest {

    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private final OpsSlackListener listener = new OpsSlackListener(formatter, slackNotifier);

    @Test
    @DisplayName("이벤트를 받으면 포매터 결과를 그대로 Slack 전송기에 넘긴다")
    void forwardsFormattedMessageToNotifier() {
        UserRegisteredEvent event = new UserRegisteredEvent(1L, "20230001", "홍길동", LocalDateTime.of(2026, 8, 22, 23, 41));
        when(formatter.userRegistered(event)).thenReturn("formatted");

        listener.onUserRegistered(event);

        verify(slackNotifier).send("formatted");
    }

    @Test
    @DisplayName("전송기가 예외를 던져도 리스너 밖으로 전파하지 않는다 — 비동기 예외 핸들러(ERROR→Sentry 폭주)로 새지 않게")
    void swallowsNotifierFailure() {
        when(formatter.adminUserAction(any())).thenReturn("formatted");
        doThrow(new IllegalStateException("slack down")).when(slackNotifier).send(anyString());

        assertThatCode(() -> listener.onAdminUserAction(new AdminUserActionEvent(AdminUserAction.FORCE_LOGOUT, 1L, 2L)))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("포매터가 예외를 던져도 전파하지 않고 전송도 하지 않는다")
    void swallowsFormatterFailure() {
        when(formatter.facilityBookingSubmitted(any())).thenThrow(new NullPointerException("boom"));

        assertThatCode(() -> listener.onFacilityBookingSubmitted(new FacilityBookingSubmittedEvent(1L, 2L)))
                .doesNotThrowAnyException();
        verify(slackNotifier, never()).send(anyString());
    }
}
