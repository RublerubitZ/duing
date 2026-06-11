package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewPhase;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;
import com.duing.domain.interview.service.dto.query.VisibleMembership;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralApplicantInterviewService implements ApplicantInterviewService {

    private final ApplicationRepository applicationRepository;
    private final InterviewRoundMemberRepository interviewRoundMemberRepository;
    private final InterviewAvailabilityRepository interviewAvailabilityRepository;
    private final InterviewSlotRepository interviewSlotRepository;
    private final InterviewScheduleRepository interviewScheduleRepository;
    private final Clock clock;

    @Override
    public ApplicantInterviewView getMyInterview(Long applicationId, Long currentUserId) {
        Application application = applicationRepository.findWithRecruitmentAndClubById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(currentUserId)) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        if (!application.getRecruitment().isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }

        LocalDateTime now = LocalDateTime.now(clock);
        Optional<VisibleMembership> visibleMembership = interviewRoundMemberRepository
                .findVisibleMembershipByApplicationId(applicationId);

        if (visibleMembership.isEmpty()) {
            // 이력 조회는 visible 부재 + INTERVIEW_PENDING 분기에서만 필요하다.
            boolean hasConcludedMembership = application.getStatus() == ApplicationStatus.INTERVIEW_PENDING
                    && interviewRoundMemberRepository.existsConcludedMembershipByApplicationId(applicationId);
            return ApplicantInterviewView.phaseOnly(ApplicantInterviewPhase.derive(
                    application.getStatus(), null, null, hasConcludedMembership, false));
        }

        InterviewRound round = visibleMembership.get().round();
        InterviewRoundMember member = visibleMembership.get().member();
        boolean deadlinePassed = round.getAvailabilityDeadline() != null
                && now.isAfter(round.getAvailabilityDeadline());

        ApplicantInterviewPhase phase = ApplicantInterviewPhase.derive(
                application.getStatus(), round.getStatus(), member.getStatus(), false, deadlinePassed);

        return new ApplicantInterviewView(
                phase,
                round.getStatus() == RoundStatus.COLLECTING ? round.getAvailabilityDeadline() : null,
                round.getStatus() == RoundStatus.COLLECTING ? selectableSlots(round, applicationId) : null,
                member.getStatus() == RoundMemberStatus.NO_AVAILABLE_SLOT
                        ? member.getAlternativeAvailabilityText() : null,
                phase == ApplicantInterviewPhase.SCHEDULED ? scheduledInterview(round, applicationId) : null);
    }

    /** 재응답 화면용 — COLLECTING 라운드의 슬롯 전체에 내 선택 여부를 표시한다 (§9.2). */
    private List<ApplicantInterviewView.SelectableSlot> selectableSlots(InterviewRound round, Long applicationId) {
        Set<Long> selectedSlotIds = interviewAvailabilityRepository
                .findByRoundIdAndApplicationId(round.getId(), applicationId).stream()
                .map(InterviewAvailability::getSlotId)
                .collect(Collectors.toSet());
        return interviewSlotRepository.findByRoundIdOrderByStartTimeAsc(round.getId()).stream()
                .map(slot -> new ApplicantInterviewView.SelectableSlot(
                        slot.getId(), slot.getStartTime(), slot.getEndTime(),
                        selectedSlotIds.contains(slot.getId())))
                .toList();
    }

    private ApplicantInterviewView.ScheduledInterview scheduledInterview(InterviewRound round, Long applicationId) {
        return interviewScheduleRepository
                .findByRoundIdAndApplicationIdAndStatus(round.getId(), applicationId, InterviewScheduleStatus.ASSIGNED)
                .flatMap(schedule -> interviewSlotRepository.findById(schedule.getSlotId()))
                .map(slot -> new ApplicantInterviewView.ScheduledInterview(
                        slot.getStartTime(), slot.getEndTime(), round.getLocation()))
                .orElse(null);
    }
}
