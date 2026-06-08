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
import java.util.Comparator;
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
                .orElseGet(() -> new MyInterviewScheduleResponse(false, null, null));
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

        // 초기 조회는 슬롯 id 목록만 얻기 위한 용도. capacity 등 동시 변경 가능한 값은 lock 후 다시 읽어야 한다.
        List<Long> slotIdsAsc = slotRepository.findByRecruitmentIdOrderByStartTimeAsc(recruitmentId).stream()
                .map(InterviewSlot::getId)
                .sorted()
                .toList();
        if (slotIdsAsc.isEmpty()) {
            throw new InterviewException.NoSlotsAvailable();
        }

        // capacity-changing path (autoAssign + manual assign + slot capacity 수정) 직렬화를 위해
        // 모든 recruitment 슬롯을 id 오름차순으로 pessimistic lock 한다. manual assign 의 source/target
        // slot lock 과 동일 순서라 deadlock 회피. interview_config → slots 두 단계 lock 순서를 양 path 가 공유.
        // **lock 후 반환된 인스턴스의 capacity 를 사용해야 stale read 로 인한 overbook 을 차단할 수 있다.**
        List<InterviewSlot> lockedSlots = slotRepository.findAllByIdInForUpdate(slotIdsAsc);
        // 매칭은 startTime 오름차순으로 진행해야 spec 의 tie-break 가 동작한다.
        List<InterviewSlot> slots = lockedSlots.stream()
                .sorted(Comparator.comparing(InterviewSlot::getStartTime))
                .toList();

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

        // 기존 ASSIGNED 일정 (운영진 수동 배정 등) 을 매칭 입력에 반영한다.
        // - 슬롯의 effective capacity = capacity - 기존 ASSIGNED 수 (overbooking 방지)
        // - 이미 ASSIGNED 인 지원자는 매칭 대상에서 제외 (수동 결정 보호)
        List<InterviewSchedule> existingSchedules = scheduleRepository.findByRecruitmentId(recruitmentId);
        Map<Long, Long> existingAssignedCountBySlotId = existingSchedules.stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .collect(Collectors.groupingBy(InterviewSchedule::getSlotId, Collectors.counting()));
        Set<Long> alreadyAssignedApplicationIds = existingSchedules.stream()
                .filter(schedule -> schedule.getStatus() == InterviewScheduleStatus.ASSIGNED)
                .map(InterviewSchedule::getApplicationId)
                .collect(Collectors.toSet());

        List<MatchingInput.ApplicantSelection> applicantsToMatch = matchableApplicants.stream()
                .filter(selection -> !alreadyAssignedApplicationIds.contains(selection.applicationId()))
                .toList();

        List<MatchingInput.SlotState> slotStates = slots.stream()
                .map(slot -> {
                    int effectiveCapacity = Math.max(0, slot.getCapacity()
                            - existingAssignedCountBySlotId.getOrDefault(slot.getId(), 0L).intValue());
                    return new MatchingInput.SlotState(slot.getId(), slot.getStartTime(), effectiveCapacity);
                })
                .toList();

        MatchingResult matchingResult = matchingService.match(new MatchingInput(applicantsToMatch, slotStates));

        // save 직전 final capacity recheck — lock 안에서 현재 ASSIGNED 수를 다시 읽어
        // (capacity - existing - new) >= 0 인지 슬롯별 검증한다. effectiveCapacity 가 이미 보장하지만
        // 동시성·race-condition 회귀에 대한 이중 안전망.
        Map<Long, Long> newAssignmentCountBySlotId = matchingResult.assigned().stream()
                .collect(Collectors.groupingBy(
                        MatchingResult.Assignment::slotId, Collectors.counting()));
        Map<Long, Integer> capacityBySlotId = slots.stream()
                .collect(Collectors.toMap(InterviewSlot::getId, InterviewSlot::getCapacity));
        for (Map.Entry<Long, Long> entry : newAssignmentCountBySlotId.entrySet()) {
            Long slotId = entry.getKey();
            long newCount = entry.getValue();
            long currentAssigned = existingAssignedCountBySlotId.getOrDefault(slotId, 0L);
            int capacity = capacityBySlotId.getOrDefault(slotId, 0);
            if (currentAssigned + newCount > capacity) {
                throw new InterviewException.CapacityExceeded();
            }
        }

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

        // N+1 회피: config 는 모집당 1 row 이므로 한 번만 조회해 모든 슬롯 view 에 동일 location 매핑
        String location = configRepository.findByRecruitmentId(recruitmentId)
                .map(InterviewConfig::getLocation)
                .orElse(null);

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
                            location,
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

        Long recruitmentId = application.getRecruitment().getId();
        // capacity-changing path (autoAssign + manual assign) 직렬화를 위해
        // interview_config row 를 먼저 lock 한다. autoAssign 도 동일 순서(config → slots)로 lock 잡아
        // 두 path 가 같은 boundary 를 공유한다. config 가 없는 모집은 manual assign 불가.
        configRepository.findByRecruitmentIdForUpdate(recruitmentId)
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);

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
        // composite FK (slot_id, recruitment_id) 위반이 persistence 단에서 500 으로 누설되지 않도록
        // service 진입부에서 cross-recruitment slot 배정을 명시적으로 거부한다.
        if (!targetSlot.getRecruitmentId().equals(application.getRecruitment().getId())) {
            throw new InterviewException.InvalidSlotSelection();
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

        String location = configRepository.findByRecruitmentId(schedule.getRecruitmentId())
                .map(InterviewConfig::getLocation)
                .orElse(null);

        return new MyInterviewScheduleResponse(true,
                new MyInterviewScheduleResponse.InterviewScheduleDetail(
                        schedule.getId(),
                        slot.getId(),
                        slot.getStartTime(),
                        slot.getEndTime(),
                        schedule.getStatus(),
                        schedule.getAssignedAt()),
                location);
    }
}
