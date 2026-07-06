package com.duing.domain.federation.service.dto.query;

/** admin FAQ 목록 집계용 groupBy(faqId, helpful) 결과 한 줄. */
public record FaqFeedbackCount(Long faqId, boolean helpful, long count) {
}
