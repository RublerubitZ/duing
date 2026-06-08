package com.duing.domain.interview.controller.dto.response;

import java.util.List;

public record MyInterviewAvailabilitiesResponse(List<Long> slotIds) {
    public static MyInterviewAvailabilitiesResponse of(List<Long> slotIds) {
        return new MyInterviewAvailabilitiesResponse(slotIds);
    }
}
