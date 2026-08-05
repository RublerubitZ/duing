package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.RespondInterviewAvailabilityCommand;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewPhase;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;
import com.duing.domain.interview.service.dto.query.VisibleMembership;
import com.duing.domain.recruitment.service.ClosedRecruitmentPolicy;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
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

    @Override
    @Transactional
    public void respondAvailability(RespondInterviewAvailabilityCommand respondCommand) {
        Application application = applicationRepository
                .findWithRecruitmentAndClubById(respondCommand.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (!application.getUser().getId().equals(respondCommand.currentUserId())) {
            throw new ApplicationDomainException.ForbiddenApplicationAccessException();
        }
        if (!application.getRecruitment().isUseInterview()) {
            throw new InterviewException.InterviewNotUsed();
        }
        // 마감된 모집은 아카이브 — 지원자 쓰기도 철회와 동일하게 막는다. 마감 후에는 라운드 진행 자체가
        // 불가능하므로(라운드 생성 차단) 여기서 받은 가능 시간은 어디에도 쓰이지 않는다.
        // 위 findWithRecruitmentAndClubById 로 이미 로드된 모집이라 추가 조회는 없다.
        //
        // 모집 행을 잠그지 않으므로 "OPEN 확인 → 마감 커밋 → 여기서 INSERT" 창이 남는다(#883 이 라운드
        // 생성에서 닫은 것과 같은 모양). 잠그지 않는 이유는 오염 범위가 다르기 때문이다 — 라운드는 마감된
        // 모집에 운영 객체를 만들지만, 여기서 새는 것은 아무 라운드도 진행되지 않는 모집의 availability 행
        // 하나뿐이라 학생·운영진 어느 화면에도 나타나지 않는다.
        if (ClosedRecruitmentPolicy.isClosed(application.getRecruitment())) {
            throw new InterviewException.RecruitmentClosed();
        }

        // §16-7: 동시 합불 처리·동시 자기 응답을 application 행에서 직렬화한다.
        // FORCE_INCREMENT 로 version 이 올라 잠금 없는 updateStatus 가 커밋 시 409 로 충돌한다.
        Application lockedApplication = applicationRepository
                .findAllByIdInForUpdate(List.of(application.getId()))
                .stream().findFirst()
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);
        if (lockedApplication.getStatus() != ApplicationStatus.INTERVIEW_PENDING) {
            throw new InterviewException.ApplicationAlreadyDecided();
        }

        VisibleMembership visibleMembership = interviewRoundMemberRepository
                .findVisibleMembershipByApplicationId(respondCommand.applicationId())
                .orElseThrow(InterviewException.RoundMembershipNotFound::new);
        InterviewRound round = visibleMembership.round();
        InterviewRoundMember member = visibleMembership.member();

        LocalDateTime now = LocalDateTime.now(clock);
        // §9.3 strict 경계 — 정각(now == deadline)은 아직 열려 있다. COLLECTING 의 deadline 은
        // 발송 가드가 보장하므로 null 은 도달 불가지만 방어적으로 닫힘 처리한다.
        boolean periodOpen = round.getStatus() == RoundStatus.COLLECTING
                && round.getAvailabilityDeadline() != null
                && !now.isAfter(round.getAvailabilityDeadline());
        if (!periodOpen) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }

        boolean slotsGiven = respondCommand.slotIds() != null && !respondCommand.slotIds().isEmpty();
        if (slotsGiven == respondCommand.noAvailableSlot()) {
            throw new InterviewException.InvalidAvailabilityRequest();
        }
        if (slotsGiven && respondCommand.alternativeText() != null) {
            throw new InterviewException.InvalidAvailabilityRequest();
        }

        interviewAvailabilityRepository.softDeleteByRoundIdAndApplicationId(
                round.getId(), respondCommand.applicationId());

        if (slotsGiven) {
            // 입력 중복은 클라이언트 실수 보호 차원에서 제거하되 순서는 유지한다 (bulkUpdateStatus 전례).
            Set<Long> slotIds = new LinkedHashSet<>(respondCommand.slotIds());
            // §16-7-1: 선택 슬롯 행을 잠가 슬롯 시간변경/삭제의 참조 검사와 직렬화한다.
            List<InterviewSlot> slots = interviewSlotRepository.findAllByIdInForUpdate(slotIds);
            if (slots.size() != slotIds.size()
                    || slots.stream().anyMatch(slot -> !slot.getRoundId().equals(round.getId()))) {
                throw new InterviewException.InvalidSlotSelection();
            }
            interviewAvailabilityRepository.saveAll(slotIds.stream()
                    .map(slotId -> InterviewAvailability.create(
                            respondCommand.applicationId(), slotId, round.getId()))
                    .toList());
        }

        // 잠금 순서 통일: 슬롯 먼저, 멤버 나중 — 자동배정(round→slots→members)과 자원 순서가
        // 일치해야 교착 사이클이 없다 (BE#9 adversarial 재검증 반영).
        // clearAutomatically 로 비워진 PC 에서 멤버를 잠금 재로드한다 — 신선한 상태 확보(§16-7-2:
        // Rule 2 재초대 등 같은 멤버 행의 동시 writer 와 직렬화) + 전이 dirty check 복원.
        InterviewRoundMember managedMember = interviewRoundMemberRepository
                .findByIdForUpdate(member.getId()).orElseThrow(InterviewException.RoundMembershipNotFound::new);

        if (slotsGiven) {
            managedMember.markResponded();
        } else {
            managedMember.reportNoAvailableSlot(respondCommand.alternativeText());
        }
    }
}
