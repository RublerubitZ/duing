package com.duing.domain.interview.service;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.interview.controller.dto.response.MyInterviewScheduleResponse;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralInterviewScheduleService implements InterviewScheduleService {

    private final ApplicationRepository applicationRepository;
    private final InterviewScheduleRepository scheduleRepository;
    private final InterviewSlotRepository slotRepository;

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
                .map(schedule -> buildAssignedResponse(schedule))
                .orElseGet(() -> new MyInterviewScheduleResponse(false, null));
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
