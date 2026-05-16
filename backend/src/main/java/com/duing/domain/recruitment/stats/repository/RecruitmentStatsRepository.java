package com.duing.domain.recruitment.stats.repository;

import static com.duing.domain.application.entity.QApplication.application;

import com.duing.domain.application.entity.ApplicationStatus;
import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecruitmentStatsRepository implements RecruitmentStatsRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Map<ApplicationStatus, Long> findSummaryByRecruitmentId(Long recruitmentId) {
        List<Tuple> tuples = queryFactory
                .select(application.status, application.count())
                .from(application)
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        application.deletedAt.isNull()
                )
                .groupBy(application.status)
                .fetch();

        Map<ApplicationStatus, Long> statusCountMap = new EnumMap<>(ApplicationStatus.class);
        for (Tuple tuple : tuples) {
            ApplicationStatus status = tuple.get(application.status);
            Long count = tuple.get(application.count());
            if (status != null && count != null) {
                statusCountMap.put(status, count);
            }
        }
        return statusCountMap;
    }
}