package com.duing.domain.federation.repository;

import com.duing.domain.federation.service.dto.query.FaqFeedbackCount;
import java.util.Collection;
import java.util.List;

public interface FederationFaqFeedbackRepositoryCustom {

    /** admin FAQ 목록 집계 — 페이지에 담긴 faqId만 IN 조회해 groupBy(faqId, helpful) 하는 단발 쿼리(N+1 방지). */
    List<FaqFeedbackCount> countGroupedByFaqIdAndHelpful(Collection<Long> faqIds);
}
