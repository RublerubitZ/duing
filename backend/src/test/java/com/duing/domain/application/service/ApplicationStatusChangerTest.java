package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.entity.ApplicationStatusHistory;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 전이와 이력 기록이 한 쌍으로만 일어나는지를 고정한다 — 두 호출자(지원 상태 변경·면접 라운드 생성)가
 * 각자 복제하던 조립이므로, 짝이 깨지면 이력에 구멍이 생긴다.
 */
class ApplicationStatusChangerTest {

    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository =
            mock(ApplicationStatusHistoryRepository.class);

    private final ApplicationStatusChanger applicationStatusChanger =
            new ApplicationStatusChanger(applicationStatusHistoryRepository);

    private Application submittedApplication() {
        return Application.submit(mock(Recruitment.class), mock(User.class), List.of());
    }

    @Test
    @DisplayName("전이에 성공하면 이전 상태·새 상태·변경 주체가 담긴 이력이 한 건 기록된다")
    void successfulTransitionRecordsSingleHistoryRow() {
        Application application = submittedApplication();
        User changedBy = mock(User.class);

        applicationStatusChanger.change(
                application, ApplicationStatus.ON_HOLD, false, false, () -> changedBy);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ON_HOLD);
        ArgumentCaptor<ApplicationStatusHistory> savedHistory =
                ArgumentCaptor.forClass(ApplicationStatusHistory.class);
        verify(applicationStatusHistoryRepository).save(savedHistory.capture());
        assertThat(savedHistory.getValue().getApplication()).isSameAs(application);
        assertThat(savedHistory.getValue().getPreviousStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        assertThat(savedHistory.getValue().getNewStatus()).isEqualTo(ApplicationStatus.ON_HOLD);
        assertThat(savedHistory.getValue().getChangedBy()).isSameAs(changedBy);
    }

    @Test
    @DisplayName("FSM 이 허용하지 않는 전이는 예외가 그대로 전파되고 이력도 남지 않는다")
    void blockedTransitionPropagatesExceptionWithoutHistory() {
        Application application = submittedApplication();
        // 면접을 쓰지 않는 모집에서는 SUBMITTED → INTERVIEW_PENDING 이 열려 있지 않다.
        AtomicInteger changedByLookups = new AtomicInteger();

        assertThatThrownBy(() -> applicationStatusChanger.change(
                application, ApplicationStatus.INTERVIEW_PENDING, false, false,
                () -> {
                    changedByLookups.incrementAndGet();
                    return mock(User.class);
                }))
                .isInstanceOf(ApplicationDomainException.InvalidStatusTransitionException.class);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.SUBMITTED);
        verify(applicationStatusHistoryRepository, never()).save(any());
        // 막힌 전이에서 변경 주체 조회(DB 왕복)까지 일어나서는 안 된다.
        assertThat(changedByLookups).hasValue(0);
    }

    @Test
    @DisplayName("마감된 모집에서는 면접 단계를 건너뛴 최종 결과 확정 전이도 이력과 함께 기록된다")
    void closedRecruitmentFinalizingTransitionIsRecorded() {
        Application application = submittedApplication();
        User changedBy = mock(User.class);

        applicationStatusChanger.change(
                application, ApplicationStatus.ACCEPTED, true, true, () -> changedBy);

        assertThat(application.getStatus()).isEqualTo(ApplicationStatus.ACCEPTED);
        verify(applicationStatusHistoryRepository).save(any());
    }
}
