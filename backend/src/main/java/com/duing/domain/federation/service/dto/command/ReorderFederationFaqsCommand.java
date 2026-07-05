package com.duing.domain.federation.service.dto.command;

import java.util.List;

public record ReorderFederationFaqsCommand(List<Long> orderedIds) {
}
