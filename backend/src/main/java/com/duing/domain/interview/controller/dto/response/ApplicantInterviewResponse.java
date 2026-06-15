package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.ApplicantInterviewPhase;
import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;
import java.time.LocalDateTime;
import java.util.List;

public record ApplicantInterviewResponse(
        ApplicantInterviewPhase phase,
        LocalDateTime availabilityDeadline,
        List<SelectableSlot> slots,
        String myAlternativeText,
        ScheduledInterview scheduledInterview
) {
    public record SelectableSlot(Long slotId, LocalDateTime startTime, LocalDateTime endTime,
                                 boolean selected) {
        public static SelectableSlot from(ApplicantInterviewView.SelectableSlot slot) {
            return new SelectableSlot(slot.slotId(), slot.startTime(), slot.endTime(), slot.selected());
        }
    }

    public record ScheduledInterview(LocalDateTime startTime, LocalDateTime endTime, String location) {
        public static ScheduledInterview from(ApplicantInterviewView.ScheduledInterview interview) {
            return new ScheduledInterview(interview.startTime(), interview.endTime(), interview.location());
        }
    }

    public static ApplicantInterviewResponse from(ApplicantInterviewView view) {
        return new ApplicantInterviewResponse(
                view.phase(),
                view.availabilityDeadline(),
                view.slots() == null ? null : view.slots().stream().map(SelectableSlot::from).toList(),
                view.myAlternativeText(),
                view.scheduledInterview() == null ? null : ScheduledInterview.from(view.scheduledInterview()));
    }
}
