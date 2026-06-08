package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.CreateAvailabilitiesInSubmissionCommand;
import com.duing.domain.interview.service.dto.command.UpdateAvailabilityCommand;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewAvailabilityService implements InterviewAvailabilityService {

    private final ApplicationRepository applicationRepository;
    private final InterviewConfigRepository configRepository;
    private final InterviewSlotRepository slotRepository;
    private final InterviewAvailabilityRepository availabilityRepository;

    /**
     * 지원서 제출 트랜잭션 안에서 지원자의 면접 가능 시간을 일괄 등록한다.
     *
     * <p>검증 흐름:
     * <ol>
     *   <li>모집에 InterviewConfig 가 없는데 slotIds 가 비어있지 않으면 → 400 InvalidSlotSelection</li>
     *   <li>모집에 InterviewConfig 가 있는데 slotIds 가 비어있으면 → 400 InvalidSlotSelection</li>
     *   <li>현재 시각이 availabilityDeadline 이후이면 → 409 AvailabilityPeriodClosed</li>
     *   <li>slotIds 에 중복이 있으면 → 400 DuplicateSlotInRequest</li>
     *   <li>slotId 가 모두 동일 recruitment 소속이 아니면 → 400 InvalidSlotSelection</li>
     *   <li>bulk insert 가 DataIntegrityViolation 을 던지면 → 409 AvailabilityConflict</li>
     * </ol>
     */
    @Override
    @Transactional
    public void createAllInSubmission(CreateAvailabilitiesInSubmissionCommand command) {
        Long recruitmentId = command.recruitmentId();
        List<Long> slotIds = command.interviewSlotIds();

        InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId).orElse(null);

        if (config == null) {
            if (!slotIds.isEmpty()) {
                throw new InterviewException.InvalidSlotSelection();
            }
            // 면접 설정이 없는 일반 모집 — availability 등록 없이 정상 종료
            return;
        }

        if (slotIds.isEmpty()) {
            throw new InterviewException.InvalidSlotSelection();
        }

        if (!config.isAvailabilitySubmissionAllowed(LocalDateTime.now())) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }

        if (new HashSet<>(slotIds).size() != slotIds.size()) {
            throw new InterviewException.DuplicateSlotInRequest();
        }

        List<InterviewSlot> slots = slotRepository.findAllById(slotIds);
        if (slots.size() != slotIds.size()
                || slots.stream().anyMatch(slot -> !slot.getRecruitmentId().equals(recruitmentId))) {
            throw new InterviewException.InvalidSlotSelection();
        }

        List<InterviewAvailability> availabilities = slotIds.stream()
                .map(slotId -> InterviewAvailability.create(command.applicationId(), slotId, recruitmentId))
                .toList();

        try {
            availabilityRepository.saveAll(availabilities);
        } catch (DataIntegrityViolationException duplicateAvailability) {
            if (isAvailabilityUniqueViolation(duplicateAvailability)) {
                throw new InterviewException.AvailabilityConflict();
            }
            throw duplicateAvailability;
        }
    }

    /**
     * 지원자 본인이 자신의 application 에 등록된 면접 가능 시간을 전체 교체한다.
     *
     * <p>검증 흐름:
     * <ol>
     *   <li>application 조회 → 없으면 404 ApplicationNotFoundException</li>
     *   <li>actorUserId 가 application 소유자가 아니면 → 403 NotApplicationOwner</li>
     *   <li>모집에 InterviewConfig 가 없으면 → 404 InterviewConfigNotFound</li>
     *   <li>assignmentCompletedAt 이 채워져 있으면 → 409 AssignmentAlreadyCompleted</li>
     *   <li>현재 시각이 availabilityDeadline 이후이면 → 409 AvailabilityPeriodClosed</li>
     *   <li>slotIds 가 비어있으면 → 400 InvalidSlotSelection</li>
     *   <li>slotIds 에 중복이 있으면 → 400 DuplicateSlotInRequest</li>
     *   <li>slotId 가 모두 동일 recruitment 소속이 아니면 → 400 InvalidSlotSelection</li>
     *   <li>기존 availability 전체 삭제 후 새 entities 저장</li>
     * </ol>
     */
    @Override
    @Transactional
    public void replace(UpdateAvailabilityCommand command) {
        Application application = applicationRepository.findById(command.applicationId())
                .orElseThrow(ApplicationDomainException.ApplicationNotFoundException::new);

        if (!application.getUser().getId().equals(command.actorUserId())) {
            throw new InterviewException.NotApplicationOwner();
        }

        Long recruitmentId = application.getRecruitment().getId();

        InterviewConfig config = configRepository.findByRecruitmentId(recruitmentId)
                .orElseThrow(InterviewException.InterviewConfigNotFound::new);

        if (config.getAssignmentCompletedAt() != null) {
            throw new InterviewException.AssignmentAlreadyCompleted();
        }

        if (!config.isAvailabilitySubmissionAllowed(LocalDateTime.now())) {
            throw new InterviewException.AvailabilityPeriodClosed();
        }

        List<Long> slotIds = command.slotIds();
        if (slotIds.isEmpty()) {
            throw new InterviewException.InvalidSlotSelection();
        }

        if (new HashSet<>(slotIds).size() != slotIds.size()) {
            throw new InterviewException.DuplicateSlotInRequest();
        }

        List<InterviewSlot> slots = slotRepository.findAllById(slotIds);
        if (slots.size() != slotIds.size()
                || slots.stream().anyMatch(slot -> !slot.getRecruitmentId().equals(recruitmentId))) {
            throw new InterviewException.InvalidSlotSelection();
        }

        availabilityRepository.softDeleteByApplicationId(command.applicationId());

        List<InterviewAvailability> newAvailabilities = slotIds.stream()
                .map(slotId -> InterviewAvailability.create(command.applicationId(), slotId, recruitmentId))
                .toList();

        try {
            availabilityRepository.saveAll(newAvailabilities);
        } catch (DataIntegrityViolationException duplicateAvailability) {
            if (isAvailabilityUniqueViolation(duplicateAvailability)) {
                throw new InterviewException.AvailabilityConflict();
            }
            throw duplicateAvailability;
        }
    }

    /**
     * PostgreSQL unique_violation (23505) 이 interview_availability 테이블의 (application_id, slot_id) 제약 위반인지 확인.
     * 다른 제약 위반은 그대로 위로 전파한다.
     */
    private boolean isAvailabilityUniqueViolation(DataIntegrityViolationException ex) {
        Throwable root = ex.getMostSpecificCause();
        if (root instanceof SQLException sqlException) {
            // PostgreSQL SQL state: 23505 = unique_violation
            String sqlState = sqlException.getSQLState();
            String message = sqlException.getMessage();
            return "23505".equals(sqlState)
                    && message != null
                    && message.contains("interview_availability");
        }
        return false;
    }
}
