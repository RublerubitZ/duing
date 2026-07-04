package com.duing.domain.federation.controller.dto.request;

import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record ReorderFederationFaqsRequest(
        @NotEmpty List<Long> orderedIds
) {
    public ReorderFederationFaqsCommand toCommand() {
        return new ReorderFederationFaqsCommand(orderedIds);
    }
}
