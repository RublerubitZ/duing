package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.GenerateBillsResult;

public record GenerateBillsResponse(int created, int skipped) {
    public static GenerateBillsResponse from(GenerateBillsResult result) {
        return new GenerateBillsResponse(result.created(), result.skipped());
    }
}
