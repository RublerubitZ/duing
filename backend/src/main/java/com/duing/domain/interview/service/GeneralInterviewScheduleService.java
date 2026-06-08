package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.interview.controller.dto.response.AutoAssignResultResponse;
import com.duing.domain.interview.controller.dto.response.MatchingCandidatesResponse;
import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.event.InterviewCancelledEvent;
import com.duing.domain.interview.event.InterviewScheduledEvent;
import com.duing.domain.interview.event.InterviewUpdatedEvent;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.MatchingInput;
import com.duing.domain.interview.service.dto.MatchingResult;
import com.duing.domain.interview.service.dto.command.AssignInterviewScheduleCommand;
import com.duing.domain.interview.service.dto.query.ScheduleListView;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewScheduleService implements InterviewScheduleService {

    private final ApplicationRepository applicationRepository;
    private final InterviewScheduleRepository scheduleRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewAvailabilityRepository availabilityRepository;
    private final InterviewConfigRepository configRepository;
    private final RecruitmentRepository recruitmentRepository;
    private final InterviewMatchingService matchingService;
    private final ClubAuthService clubAuthService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * 지원자 본인의 면접 일정을 조회한다.
     *
     * <p>검증 흐름:
     * <ol>
     *   <li>application 조회 → 없으면 404 ApplicationNotFoundException</li>
     *   <li>actorUserId 가 application 소유자가 아니면 → 403 NotApplicationOwner</li>
     *   <li>schedule 없음 → 200 {@code { assigned: false, schedule: null }}</li>
     *   <li>schedule 있음 (CANCELLED 포함) → 200 {@code { assigned: true, schedule: ... }}</li>
     * </ol>
     */
    @Override
    public MyInterviewScheduleResponse findMySchedule(Long applicationId, Long actorUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);

        if (!application.getUser().getId().equals(actorUserId)) {
            throw new InterviewException.NotApplicationOwner();
        }

        return scheduleRepository.findByApplicationId(applicationId)
                .map(this::buildAssignedResponse)
                .orElseGet(() -> new MyInterviewScheduleResponse(false, null));
    }

    /**
     * 운영진이 자동배정을 실행한다.
     *
     * <p>검증 흐름:
     * <ol>
     *   <li>recruitment 조회 + 운영진 권한 확인</li>
     *   <li>interview_config SELECT FOR UPDATE (pessimistic lock)</li>
     *   <li>availabilityDeadline 미경과 → 409 AvailabilityPeriodOpen</li>
     *   <li>assignmentCompletedAt != null → 409 AssignmentAlreadyCompleted</li>
     *   <li>슬롯 없음 → 409 NoSlotsAvailable</li>
     *   <li>INTERVIEW_PENDING 지원자 없음 → 409 NoCandidates</li>
     *   <li>매칭 실행 → 결과 upsert → 이벤트 발행 → config 완료 표시</li>
     * </ol>
     */
    @Override
    @Transactional
    public AutoAssignResultResponse autoAssign(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        InterviewConfig config = configRepository.findByRecruitmentIdForUpdate(recruitmentId)
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);

        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(config.getAvailabilityDeadline())) {
            throw new InterviewException.AvailabilityPeriodOpen();
        }
        if (config.getAssignmentCompletedAt() != null) {
            throw new InterviewException.AssignmentAlreadyCompleted();
        }

        List<InterviewSlot> slots = slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId);
        if (slots.isEmpty()) {
            throw new InterviewException.NoSlotsAvailable();
        }

        List<Application> allCandidates = applicationRepository
                .findByRecruitmentIdAndStatus(recruitmentId, ApplicationStatus.INTERVIEW_PENDING);
        if (allCandidates.isEmpty()) {
            throw new InterviewException.NoCandidates();
        }

        List<InterviewAvailability> availabilities = availabilityRepository.findByRecruitmentId(recruitmentId);

        Map<Long, Set<Long>> availabilityByApplicationId = availabilities.stream()
                .collect(Collectors.groupingBy(
                        InterviewAvailability::getApplicationId,
                        Collectors.mapping(InterviewAvailability::getSlotId, Collectors.toSet())));

        List<MatchingInput.ApplicantSelection> matchableApplicants = allCandidates.stream()
                .filter(candidate -> availabilityByApplicationId.containsKey(candidate.getId()))
                .map(candidate -> new MatchingInput.ApplicantSelection(
                        candidate.getId(),
                        availabilityByApplicationId.get(candidate.getId())))
                .toList();

        int noAvailabilityCount = allCandidates.size() - matchableApplicants.size();

        List<MatchingInput.SlotState> slotStates = slots.stream()
                .map(slot -> new MatchingInput.SlotState(slot.getId(), slot.getStartTime(), slot.getCapacity()))
                .toList();

        MatchingResult matchingResult = matchingService.match(new MatchingInput(matchableApplicants, slotStates));

        List<InterviewSchedule> toSave = new ArrayList<>();
        List<InterviewScheduledEvent> eventsToPublish = new ArrayList<>();
        for (MatchingResult.Assignment assignment : matchingResult.assigned()) {
            InterviewSchedule schedule = scheduleRepository.findByApplicationId(assignment.applicationId())
                    .map(existingSchedule -> {
                        existingSchedule.reassign(assignment.slotId(), now);
                        return existingSchedule;
                    })
                    .orElseGet(() -> InterviewSchedule.create(
                            assignment.applicationId(), assignment.slotId(), recruitmentId, now));
            toSave.add(schedule);
            eventsToPublish.add(
                    new InterviewScheduledEvent(assignment.applicationId(), assignment.slotId(), recruitmentId));
        }
        scheduleRepository.saveAll(toSave);
        eventsToPublish.forEach(eventPublisher::publishEvent);

        config.markAssignmentCompleted(now);

        return new AutoAssignResultResponse(
                allCandidates.size(),
                matchingResult.assigned().size(),
                matchingResult.unassignedApplicationIds().size(),
                noAvailabilityCount,
                now);
    }

    /**
     * 운영진 대시보드용 — 슬롯별로 그룹핑된 면접 일정 목록을 반환한다.
     */
    @Override
    public List<ScheduleListView> listSchedules(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        List<InterviewSlot> slots = slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId);
        List<InterviewSchedule> schedules = scheduleRepository.findByRecruitmentId(recruitmentId);

        Map<Long, List<InterviewSchedule>> schedulesBySlotId = schedules.stream()
                .collect(Collectors.groupingBy(InterviewSchedule::getSlotId));

        return slots.stream()
                .map(slot -> {
                    List<ScheduleListView.AssignedItem> assignedItems = schedulesBySlotId
                            .getOrDefault(slot.getId(), List.of())
                            .stream()
                            .map(schedule -> new ScheduleListView.AssignedItem(
                                    schedule.getId(),
                                    schedule.getApplicationId(),
                                    schedule.getStatus(),
                                    schedule.getAssignedAt()))
                            .toList();
                    return new ScheduleListView(
                            slot.getId(),
                            slot.getStartTime(),
                            slot.getEndTime(),
                            slot.getCapacity(),
                            assignedItems);
                })
                .toList();
    }

    /**
     * 자동배정 실행 전 후보 통계를 미리 조회한다 (dry-run).
     * 슬롯별 가용 시간 신청 수와 이미 배정된 수를 포함한다.
     */
    @Override
    public MatchingCandidatesResponse listCandidates(Long recruitmentId, Long actorUserId) {
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId)
                .orElseThrow(RecruitmentException.RecruitmentNotFoundException::new);
        clubAuthService.requireManager(actorUserId, recruitment.getClub().getId());

        List<Application> allCandidates = applicationRepository
                .findByRecruitmentIdAndStatus(recruitmentId, ApplicationStatus.INTERVIEW_PENDING);

        List<InterviewAvailability> availabilities = availabilityRepository.findByRecruitmentId(recruitmentId);

        Set<Long> applicationIdsWithAvailability = availabilities.stream()
                .map(InterviewAvailability::getApplicationId)
                .collect(Collectors.toSet());

        int candidatesWithAvailability = (int) allCandidates.stream()
                .filter(candidate -> applicationIdsWithAvailability.contains(candidate.getId()))
                .count();
        int candidatesWithoutAvailability = allCandidates.size() - candidatesWithAvailability;

        List<InterviewSlot> slots = slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId);

        Map<Long, Long> availabilityCountBySlot = availabilities.stream()
                .collect(Collectors.groupingBy(InterviewAvailability::getSlotId, Collectors.counting()));

        List<InterviewSchedule> allSchedules = scheduleRepository.findByRecruitmentId(recruitmentId);
        Map<Long, Long> assignedCountBySlot = allSchedules.stream()
                .filter(schedule -> schedule.getStatus()
                        == InterviewScheduleStatus.ASSIGNED)
                .collect(Collectors.groupingBy(InterviewSchedule::getSlotId, Collectors.counting()));

        List<MatchingCandidatesResponse.SlotCandidatesView> slotViews = slots.stream()
                .map(slot -> new MatchingCandidatesResponse.SlotCandidatesView(
                        slot.getId(),
                        slot.getStartTime(),
                        slot.getCapacity(),
                        availabilityCountBySlot.getOrDefault(slot.getId(), 0L),
                        assignedCountBySlot.getOrDefault(slot.getId(), 0L)))
                .toList();

        return new MatchingCandidatesResponse(
                allCandidates.size(),
                candidatesWithAvailability,
                candidatesWithoutAvailability,
                slotViews);
    }

    /**
     * M9 — 수동 배정/이동.
     *
     * <p>deadlock 방지를 위해 source/target 슬롯을 ID 오름차순으로 동시 lock 한다.
     */
    @Override
    @Transactional
    public void assign(AssignInterviewScheduleCommand command) {
        Application application = applicationRepository.findById(command.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);

        clubAuthService.requireManager(command.actorUserId(),
                application.getRecruitment().getClub().getId());

        if (application.getStatus() != ApplicationStatus.INTERVIEW_PENDING) {
            throw new InterviewException.InvalidApplicationStatus();
        }

        Optional<InterviewSchedule> existingSchedule =
                scheduleRepository.findByApplicationId(command.applicationId());

        Long currentSlotId = existingSchedule.map(InterviewSchedule::getSlotId).orElse(null);
        Long targetSlotId = command.slotId();

        List<Long> slotIdsToLock = Stream.of(currentSlotId, targetSlotId)
                .filter(Objects::nonNull)
                .distinct()
                .sorted()
                .toList();

        Map<Long, InterviewSlot> lockedSlots = slotRepository.findAllByIdInForUpdate(slotIdsToLock)
                .stream()
                .collect(Collectors.toMap(InterviewSlot::getId, lockedSlot -> lockedSlot));

        InterviewSlot targetSlot = lockedSlots.get(targetSlotId);
        if (targetSlot == null) {
            throw new InterviewException.SlotNotFound();
        }

        boolean isAlreadyAssignedToSameSlot = existingSchedule.isPresent()
                && targetSlotId.equals(currentSlotId)
                && existingSchedule.get().getStatus() == InterviewScheduleStatus.ASSIGNED;

        if (!isAlreadyAssignedToSameSlot) {
            long currentAssignedCount = scheduleRepository.countBySlotIdAndStatus(
                    targetSlotId, InterviewScheduleStatus.ASSIGNED);
            if (currentAssignedCount >= targetSlot.getCapacity()) {
                throw new InterviewException.CapacityExceeded();
            }
        }

        InterviewScheduleStatus priorStatus =
                existingSchedule.map(InterviewSchedule::getStatus).orElse(null);

        LocalDateTime now = LocalDateTime.now();
        InterviewSchedule schedule = existingSchedule
                .map(existing -> {
                    existing.reassign(targetSlotId, now);
                    return existing;
                })
                .orElseGet(() -> InterviewSchedule.create(
                        command.applicationId(), targetSlotId,
                        application.getRecruitment().getId(), now));
        scheduleRepository.save(schedule);

        boolean isNewAssignment = priorStatus == null
                || priorStatus == InterviewScheduleStatus.CANCELLED;
        boolean isMove = priorStatus == InterviewScheduleStatus.ASSIGNED
                && !targetSlotId.equals(currentSlotId);

        if (isNewAssignment) {
            eventPublisher.publishEvent(new InterviewScheduledEvent(
                    command.applicationId(), targetSlotId, application.getRecruitment().getId()));
        } else if (isMove) {
            eventPublisher.publishEvent(new InterviewUpdatedEvent(
                    command.applicationId(), targetSlotId, application.getRecruitment().getId()));
        }
        // 동일 슬롯 재호출(no-op)은 이벤트 없음
    }

    /**
     * M10 — 면접 일정 취소.
     */
    @Override
    @Transactional
    public void cancel(Long applicationId, Long actorUserId) {
        Application application = applicationRepository.findById(applicationId)
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);

        clubAuthService.requireManager(actorUserId,
                application.getRecruitment().getClub().getId());

        InterviewSchedule schedule = scheduleRepository.findByApplicationId(applicationId)
                .orElseThrow(InterviewException.ScheduleNotFound::new);

        Long slotId = schedule.getSlotId();
        Long recruitmentId = schedule.getRecruitmentId();

        schedule.cancel();

        eventPublisher.publishEvent(new InterviewCancelledEvent(applicationId, slotId, recruitmentId));
    }

    private MyInterviewScheduleResponse buildAssignedResponse(InterviewSchedule schedule) {
        InterviewSlot slot = slotRepository.findById(schedule.getSlotId())
                .orElseThrow(InterviewException.SlotNotFound::new);

        return new MyInterviewScheduleResponse(true,
                new MyInterviewScheduleResponse.InterviewScheduleDetail(
                        schedule.getId(),
                        slot.getId(),
                        slot.getStartTime(),
                        slot.getEndTime(),
                        schedule.getStatus(),
                        schedule.getAssignedAt()));
    }
}
