package com.duing.global.monitoring;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.Bank;
import com.duing.domain.notification.event.FacilityBookingSubmittedEvent;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.global.monitoring.event.AdminUserActionEvent;
import com.duing.global.monitoring.event.FeeAccountCreatedEvent;
import com.duing.global.monitoring.event.UserRegisteredEvent;
import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OpsSlackListenerTest {

    private final OpsSlackMessageFormatter formatter = mock(OpsSlackMessageFormatter.class);
    private final SlackNotifier slackNotifier = mock(SlackNotifier.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final OpsSlackListener listener = new OpsSlackListener(formatter, slackNotifier, clubRepository);

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
        when(formatter.facilityBookingSubmitted(any(), any())).thenThrow(new NullPointerException("boom"));

        assertThatCode(() -> listener.onFacilityBookingSubmitted(new FacilityBookingSubmittedEvent(1L, 2L)))
                .doesNotThrowAnyException();
        verify(slackNotifier, never()).send(anyString());
    }

    @Test
    @DisplayName("동아리 id 만 있는 이벤트는 동아리명을 조회해 포매터에 넘긴다")
    void resolvesClubNameForEventsWithoutIt() {
        Club club = Club.create("두잉개발회", ClubCategory.ACADEMIC, "분과", "설명", null);
        when(clubRepository.findById(7L)).thenReturn(Optional.of(club));
        FeeAccountCreatedEvent event = new FeeAccountCreatedEvent(7L, 21L, Bank.KB, 5L);
        when(formatter.feeAccountCreated(event, "두잉개발회")).thenReturn("formatted");

        listener.onFeeAccountCreated(event);

        verify(slackNotifier).send("formatted");
    }

    @Test
    @DisplayName("동아리명 조회가 예외를 던져도 전파하지 않고 전송도 하지 않는다")
    void swallowsClubLookupFailure() {
        when(clubRepository.findById(any())).thenThrow(new IllegalStateException("db down"));

        assertThatCode(() -> listener.onFacilityBookingSubmitted(new FacilityBookingSubmittedEvent(1L, 2L)))
                .doesNotThrowAnyException();
        verify(slackNotifier, never()).send(anyString());
    }
}
