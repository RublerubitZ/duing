package com.duing.domain.application.controller.dto.response;

import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;

public record ApplicantNeighborsResponse(Long prevApplicationId, Long nextApplicationId) {

    public static ApplicantNeighborsResponse from(ApplicantNeighborsQuery query) {
        return new ApplicantNeighborsResponse(query.prevApplicationId(), query.nextApplicationId());
    }
}
