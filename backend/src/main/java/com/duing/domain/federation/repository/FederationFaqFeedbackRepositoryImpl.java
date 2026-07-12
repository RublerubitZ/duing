package com.duing.domain.federation.repository;

import static com.duing.domain.federation.entity.QFederationFaqFeedback.federationFaqFeedback;

import com.duing.domain.federation.service.dto.query.FaqFeedbackCount;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.Collection;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class FederationFaqFeedbackRepositoryImpl implements FederationFaqFeedbackRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<FaqFeedbackCount> countGroupedByFaqIdAndHelpful(Collection<Long> faqIds) {
        return queryFactory
                .select(Projections.constructor(FaqFeedbackCount.class,
                        federationFaqFeedback.faq.id,
                        federationFaqFeedback.helpful,
                        federationFaqFeedback.count()))
                .from(federationFaqFeedback)
                .where(federationFaqFeedback.faq.id.in(faqIds))
                .groupBy(federationFaqFeedback.faq.id, federationFaqFeedback.helpful)
                .fetch();
    }
}
