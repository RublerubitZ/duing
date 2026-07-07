package com.duing.domain.federation.service.dto.command;

/** moveToCategoryId: null이면 카테고리가 비어 있을 때만 삭제 허용(FAQ가 남아 있으면 409). 지정 시 소속 FAQ를 전부 이관 후 삭제한다. */
public record DeleteFederationFaqCategoryCommand(Long categoryId, Long moveToCategoryId) {
}
