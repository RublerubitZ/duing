package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewProgress;
import com.duing.domain.interview.service.dto.query.AssignedInterviewSlot;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.interview.service.dto.query.ManagerInterviewSnapshot;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 지원서 화면용 면접 read-model 조립 단위 테스트.
 * application 서비스에 있던 면접 레포지토리 조합 케이스가 도메인 이동과 함께 여기로 옮겨 왔다 —
 * 조합 결과를 지원서 응답 DTO 로 매핑하는 몫은 application 쪽 단위 테스트에 그대로 남아 있다.
 */
class InterviewAssignmentQueryServiceTest {

    private final InterviewAvailabilityRepository interviewAvailabilityRepository =
            mock(InterviewAvailabilityRepository.class);
    private final InterviewScheduleRepository interviewScheduleRepository = mock(InterviewScheduleRepository.class);
    private final InterviewRoundRepository interviewRoundRepository = mock(InterviewRoundRepository.class);
    private final InterviewSlotRepository interviewSlotRepository = mock(InterviewSlotRepository.class);
    private final InterviewRoundMemberRepositoryCustom interviewRoundMemberRepository =
            mock(InterviewRoundMemberRepositoryCustom.class);
    private final Clock clock = Clock.systemDefaultZone();

    private final InterviewAssignmentQueryService interviewAssignmentQueryService =
            new InterviewAssignmentQueryService(
                    interviewAvailabilityRepository,
                    interviewScheduleRepository,
                    interviewRoundRepository,
                    interviewSlotRepository,
                    interviewRoundMemberRepository,
                    clock);

    @Test
    @DisplayName("지원자 진행 상황은 제출한 가능시간 수와 보이는 라운드의 마감 시각을 함께 반환하고 미배정이면 배정은 null 이다")
    void applicantProgressCarriesAvailabilityCountAndDeadline() {
        long applicationId = 1L;
        long recruitmentId = 3L;
        LocalDateTime deadline = LocalDateTime.of(2026, 6, 15, 18, 0);

        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(2L);
        InterviewRound collectingRound = InterviewRoundFixture.withStatus(
                recruitmentId, deadline, "3호관 201호", RoundStatus.COLLECTING);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.of(collectingRound));
        // ASSIGNED schedule 이 없으면 배정은 null
        when(interviewScheduleRepository.findConfirmedSlotByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        ApplicantInterviewProgress progress =
                interviewAssignmentQueryService.findApplicantProgress(applicationId);

        assertThat(progress.availabilityCount()).isEqualTo(2);
        assertThat(progress.availabilityDeadline()).isEqualTo(deadline);
        assertThat(progress.assigned()).isNull();
    }

    @Test
    @DisplayName("지원자에게 보이는 라운드가 없으면 마감 시각과 배정이 모두 null 이다")
    void applicantProgressHasNullDeadlineWhenVisibleRoundMissing() {
        long applicationId = 3L;

        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(0L);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.empty());
        when(interviewScheduleRepository.findConfirmedSlotByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        ApplicantInterviewProgress progress =
                interviewAssignmentQueryService.findApplicantProgress(applicationId);

        assertThat(progress.availabilityCount()).isZero();
        assertThat(progress.availabilityDeadline()).isNull();
        assertThat(progress.assigned()).isNull();
    }

    @Test
    @DisplayName("확정 라운드의 ASSIGNED InterviewSchedule 이 있으면 슬롯 시간창과 라운드 장소를 한 번의 조회로 함께 반환한다")
    void applicantProgressCarriesAssignedSlot() {
        long applicationId = 4L;
        LocalDateTime startTime = LocalDateTime.of(2026, 6, 20, 18, 0);
        LocalDateTime endTime = LocalDateTime.of(2026, 6, 20, 18, 30);

        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(3L);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.empty());
        // 슬롯 시간창과 라운드 장소는 조인 프로젝션 한 번으로 함께 내려온다.
        when(interviewScheduleRepository.findConfirmedSlotByApplicationId(applicationId))
                .thenReturn(Optional.of(new AssignedInterviewSlot(100L, startTime, endTime, "3호관 201호")));

        ApplicantInterviewProgress progress =
                interviewAssignmentQueryService.findApplicantProgress(applicationId);

        assertThat(progress.availabilityCount()).isEqualTo(3);
        assertThat(progress.assigned())
                .isEqualTo(new AssignedInterviewSlot(100L, startTime, endTime, "3호관 201호"));
    }

    @Test
    @DisplayName("InterviewSchedule 이 CANCELLED 상태만 존재하면 배정은 null 로 반환된다")
    void applicantProgressHasNullAssignedWhenOnlyCancelledSchedule() {
        long applicationId = 5L;

        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(1L);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.empty());
        // CANCELLED 는 조인 쿼리의 status=ASSIGNED 술어에서 걸러져 배정 자체가 없는 것으로 나온다.
        when(interviewScheduleRepository.findConfirmedSlotByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        ApplicantInterviewProgress progress =
                interviewAssignmentQueryService.findApplicantProgress(applicationId);

        assertThat(progress.availabilityCount()).isEqualTo(1);
        assertThat(progress.assigned()).isNull();
    }

    @Test
    @DisplayName("운영진 스냅샷은 선택한 가능시간과 배정 슬롯을 함께 담고 장소가 없는 배정도 그대로 노출한다")
    void managerSnapshotCarriesAvailabilitiesAndAssignedWithoutLocation() {
        long applicationId = 15L;
        InterviewSlotTimeWindow firstWindow = new InterviewSlotTimeWindow(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30));
        // 라운드가 삭제됐거나 장소가 비어 있으면 조인 쿼리가 location 만 null 로 채워 돌려준다.
        AssignedInterviewSlot assignedWithoutLocation = new AssignedInterviewSlot(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30), null);

        when(interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(applicationId))
                .thenReturn(List.of(firstWindow));
        when(interviewScheduleRepository.findAssignedSlotByApplicationId(applicationId))
                .thenReturn(Optional.of(assignedWithoutLocation));
        when(interviewRoundMemberRepository.findPlacementActiveMembershipByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        ManagerInterviewSnapshot snapshot =
                interviewAssignmentQueryService.findManagerSnapshot(applicationId);

        assertThat(snapshot.availabilities()).containsExactly(firstWindow);
        assertThat(snapshot.assigned()).isEqualTo(assignedWithoutLocation);
        // placement-active 멤버십이 없으면 라운드 요약은 null (= 대기열/선정 전)
        assertThat(snapshot.roundBrief()).isNull();
    }

    @Test
    @DisplayName("지원자 진행 상황의 배정은 확정 라운드 전용 조회로 가져오고 운영진용 조회는 쓰지 않는다")
    void applicantProgressUsesConfirmedSlotQueryOnly() {
        long applicationId = 6L;
        when(interviewAvailabilityRepository.countByApplicationId(applicationId)).thenReturn(1L);
        when(interviewRoundRepository.findVisibleToApplicantRoundByApplicationId(applicationId))
                .thenReturn(Optional.empty());
        when(interviewScheduleRepository.findConfirmedSlotByApplicationId(applicationId))
                .thenReturn(Optional.empty());

        interviewAssignmentQueryService.findApplicantProgress(applicationId);

        verify(interviewScheduleRepository).findConfirmedSlotByApplicationId(applicationId);
        verify(interviewScheduleRepository, never()).findAssignedSlotByApplicationId(any());
    }

    @Test
    @DisplayName("확정 배정 batch 조회는 확정 라운드의 ASSIGNED schedule 을 슬롯·라운드와 조립하고 라운드 장소가 비어 있어도 배정을 노출한다")
    void confirmedBatchExposesAssignmentEvenWhenRoundLocationIsNull() {
        InterviewSchedule assignedSchedule = mock(InterviewSchedule.class);
        when(assignedSchedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(assignedSchedule.getApplicationId()).thenReturn(10L);
        when(assignedSchedule.getSlotId()).thenReturn(101L);
        when(assignedSchedule.getRoundId()).thenReturn(30L);

        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getId()).thenReturn(101L);
        when(slot.getStartTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 0));
        when(slot.getEndTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 30));

        InterviewRound roundWithoutLocation = mock(InterviewRound.class);
        when(roundWithoutLocation.getId()).thenReturn(30L);
        when(roundWithoutLocation.getStatus()).thenReturn(RoundStatus.SCHEDULED);
        when(roundWithoutLocation.getLocation()).thenReturn(null);

        when(interviewScheduleRepository.findByApplicationIdIn(anyCollection()))
                .thenReturn(List.of(assignedSchedule));
        when(interviewSlotRepository.findAllById(any())).thenReturn(List.of(slot));
        when(interviewRoundRepository.findAllById(any())).thenReturn(List.of(roundWithoutLocation));

        Map<Long, AssignedInterviewSlot> confirmedByApplicationId =
                interviewAssignmentQueryService.findConfirmedByApplicationIds(List.of(10L));

        assertThat(confirmedByApplicationId).containsOnlyKeys(10L);
        assertThat(confirmedByApplicationId.get(10L)).isEqualTo(new AssignedInterviewSlot(
                101L, LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30), null));
    }

    @Test
    @DisplayName("배정된 라운드가 조회되지 않으면 확정 여부를 알 수 없으므로 그 배정은 노출하지 않는다")
    void confirmedBatchSkipsAssignmentWhenRoundIsAbsent() {
        InterviewSchedule assignedSchedule = mock(InterviewSchedule.class);
        when(assignedSchedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(assignedSchedule.getApplicationId()).thenReturn(16L);
        when(assignedSchedule.getSlotId()).thenReturn(201L);
        when(assignedSchedule.getRoundId()).thenReturn(40L);

        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getId()).thenReturn(201L);

        when(interviewScheduleRepository.findByApplicationIdIn(anyCollection()))
                .thenReturn(List.of(assignedSchedule));
        when(interviewSlotRepository.findAllById(any())).thenReturn(List.of(slot));
        // 라운드 자체가 없는(또는 삭제된) 배정 — 확정 라운드인지 알 수 없어 건너뛴다.
        when(interviewRoundRepository.findAllById(any())).thenReturn(List.of());

        Map<Long, AssignedInterviewSlot> confirmedByApplicationId =
                interviewAssignmentQueryService.findConfirmedByApplicationIds(List.of(16L));

        assertThat(confirmedByApplicationId).isEmpty();
    }

    @Test
    @DisplayName("확정 전(ASSIGNING) 라운드의 초안 배정은 건너뛰고 확정(SCHEDULED) 라운드의 배정만 담는다")
    void confirmedBatchSkipsDraftAssignmentsOfUnconfirmedRounds() {
        InterviewSchedule confirmedSchedule = mock(InterviewSchedule.class);
        when(confirmedSchedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(confirmedSchedule.getApplicationId()).thenReturn(21L);
        when(confirmedSchedule.getSlotId()).thenReturn(301L);
        when(confirmedSchedule.getRoundId()).thenReturn(50L);

        InterviewSchedule draftSchedule = mock(InterviewSchedule.class);
        when(draftSchedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(draftSchedule.getApplicationId()).thenReturn(22L);
        when(draftSchedule.getSlotId()).thenReturn(302L);
        when(draftSchedule.getRoundId()).thenReturn(60L);

        InterviewSlot confirmedSlot = mock(InterviewSlot.class);
        when(confirmedSlot.getId()).thenReturn(301L);
        when(confirmedSlot.getStartTime()).thenReturn(LocalDateTime.of(2026, 6, 22, 10, 0));
        when(confirmedSlot.getEndTime()).thenReturn(LocalDateTime.of(2026, 6, 22, 10, 30));
        InterviewSlot draftSlot = mock(InterviewSlot.class);
        when(draftSlot.getId()).thenReturn(302L);

        InterviewRound scheduledRound = mock(InterviewRound.class);
        when(scheduledRound.getId()).thenReturn(50L);
        when(scheduledRound.getStatus()).thenReturn(RoundStatus.SCHEDULED);
        when(scheduledRound.getLocation()).thenReturn("3호관 201호");
        InterviewRound assigningRound = mock(InterviewRound.class);
        when(assigningRound.getId()).thenReturn(60L);
        when(assigningRound.getStatus()).thenReturn(RoundStatus.ASSIGNING);

        when(interviewScheduleRepository.findByApplicationIdIn(anyCollection()))
                .thenReturn(List.of(confirmedSchedule, draftSchedule));
        when(interviewSlotRepository.findAllById(any())).thenReturn(List.of(confirmedSlot, draftSlot));
        when(interviewRoundRepository.findAllById(any())).thenReturn(List.of(scheduledRound, assigningRound));

        Map<Long, AssignedInterviewSlot> confirmedByApplicationId =
                interviewAssignmentQueryService.findConfirmedByApplicationIds(List.of(21L, 22L));

        assertThat(confirmedByApplicationId).containsOnlyKeys(21L);
        assertThat(confirmedByApplicationId.get(21L)).isEqualTo(new AssignedInterviewSlot(
                301L, LocalDateTime.of(2026, 6, 22, 10, 0), LocalDateTime.of(2026, 6, 22, 10, 30), "3호관 201호"));
    }

    @Test
    @DisplayName("ASSIGNED 가 아닌 schedule 만 있으면 슬롯·라운드 조회 없이 빈 결과를 반환한다")
    void confirmedBatchSkipsSlotLookupWhenNoAssignedSchedule() {
        InterviewSchedule cancelledSchedule = mock(InterviewSchedule.class);
        when(cancelledSchedule.getStatus()).thenReturn(InterviewScheduleStatus.CANCELLED);

        when(interviewScheduleRepository.findByApplicationIdIn(anyCollection()))
                .thenReturn(List.of(cancelledSchedule));

        Map<Long, AssignedInterviewSlot> confirmedByApplicationId =
                interviewAssignmentQueryService.findConfirmedByApplicationIds(List.of(10L));

        assertThat(confirmedByApplicationId).isEmpty();
        verify(interviewSlotRepository, never()).findAllById(any());
        verify(interviewRoundRepository, never()).findAllById(any());
    }
}
