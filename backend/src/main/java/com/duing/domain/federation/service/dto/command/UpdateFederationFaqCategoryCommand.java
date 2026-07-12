package com.duing.domain.federation.service.dto.command;

public record UpdateFederationFaqCategoryCommand(Long categoryId, String name, int sortOrder) {
}
