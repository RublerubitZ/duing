package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

class ClubDetailDailyRevalidationJobTest {

    // KST 00:05 = UTC 전날 15:05 — 주입 시계 대신 시스템 존으로 날짜를 뽑으면 하루 어긋나 대상 조회 인자가 달라진다.
    private static final Clock KST_JUST_AFTER_MIDNIGHT =
            Clock.fixed(Instant.parse("2026-03-01T15:05:00Z"), ZoneId.of("Asia/Seoul"));
    private static final LocalDate KST_TODAY = LocalDate.of(2026, 3, 2);

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final FrontendRevalidator frontendRevalidator = mock(FrontendRevalidator.class);
    private final ClubDetailDailyRevalidationJob clubDetailDailyRevalidationJob =
            new ClubDetailDailyRevalidationJob(recruitmentRepository, frontendRevalidator, KST_JUST_AFTER_MIDNIGHT);

    @AfterEach
    void clearInterruptFlag() {
        // 인터럽트 테스트가 남긴 플래그가 같은 스레드의 다음 테스트로 새지 않게 지운다.
        Thread.interrupted();
    }

    @Test
    @DisplayName("KST 오늘 기준 대상 동아리마다 상세 재생성을 집계 없이 순서대로 요청한다")
    void requestsEachTargetDetailInOrder() {
        when(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(KST_TODAY))
                .thenReturn(List.of(3L, 11L));

        clubDetailDailyRevalidationJob.refresh();

        InOrder requestOrder = inOrder(frontendRevalidator);
        requestOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/3");
        requestOrder.verify(frontendRevalidator).revalidateWithoutAlert("/clubs/11");
        verifyNoMoreInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("대상이 없으면 아무 요청도 보내지 않는다")
    void sendsNothingWithoutTargets() {
        when(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(KST_TODAY)).thenReturn(List.of());

        clubDetailDailyRevalidationJob.refresh();

        verifyNoInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("대상 조회가 실패해도 예외를 스케줄러로 내보내지 않고 요청도 보내지 않는다")
    void lookupFailureIsSwallowed() {
        when(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(any()))
                .thenThrow(new IllegalStateException("DB 장애"));

        assertThatCode(clubDetailDailyRevalidationJob::refresh).doesNotThrowAnyException();
        verifyNoInteractions(frontendRevalidator);
    }

    @Test
    @DisplayName("종료 중 인터럽트가 걸리면 남은 동아리 요청을 건너뛴다")
    void stopsRemainingRequestsWhenInterrupted() {
        when(recruitmentRepository.findClubIdsWithOngoingOrJustEndedRecruitment(KST_TODAY))
                .thenReturn(List.of(3L, 11L, 19L));
        // 요청기는 종료 중 인터럽트를 받으면 warm-up 을 건너뛰고 인터럽트 플래그를 되살린다 — 그 상태를 재현한다.
        doAnswer(invocation -> {
            Thread.currentThread().interrupt();
            return null;
        }).when(frontendRevalidator).revalidateWithoutAlert("/clubs/3");

        clubDetailDailyRevalidationJob.refresh();

        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/3");
        verifyNoMoreInteractions(frontendRevalidator);
    }
}
