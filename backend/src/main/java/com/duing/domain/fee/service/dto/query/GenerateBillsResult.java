package com.duing.domain.fee.service.dto.query;

import java.util.List;

public record GenerateBillsResult(int created, int skipped, List<Long> skippedUserIds) {
}
