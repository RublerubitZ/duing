package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import java.util.List;

public record GenerateBillsResponse(int created, int skipped, List<Long> skippedUserIds) {
    public static GenerateBillsResponse from(GenerateBillsResult result) {
        return new GenerateBillsResponse(result.created(), result.skipped(), result.skippedUserIds());
    }
}
