package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ReorderFederationFaqsRequest(
        @NotEmpty(message = "정렬할 FAQ 목록이 비어 있습니다.")
        @Size(max = 500, message = "정렬 목록은 500개 이하여야 합니다.")
        List<Long> orderedIds
) {
    public ReorderFederationFaqsCommand toCommand() {
        return new ReorderFederationFaqsCommand(orderedIds);
    }
}
