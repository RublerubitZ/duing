package com.duing.domain.recruitment.stats.repository;

import static com.duing.domain.application.entity.QApplication.application;
import static com.duing.domain.application.entity.QApplicationStatusHistory.applicationStatusHistory;

import com.duing.domain.application.entity.ApplicationStatus;
import com.querydsl.core.Tuple;
import com.querydsl.jpa.impl.JPAQueryFactory;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RecruitmentStatsRepositoryImpl implements RecruitmentStatsRepositoryCustom {

    private final JPAQueryFactory queryFactory;
    private final EntityManager entityManager;

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

    /**
     * 한국 표준시(KST, Asia/Seoul) 기준 일자별 제출 건수를 반환한다.
     * QueryDSL 은 'AT TIME ZONE' 구문을 지원하지 않으므로 native query 를 사용한다.
     * created_at 컬럼은 TIMESTAMP WITHOUT TIME ZONE 타입으로 UTC 값이 저장되므로,
     * (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul' 로 KST 일자를 정확히 산출한다.
     * 단순히 created_at AT TIME ZONE 'Asia/Seoul' 만 쓰면 저장된 값을 KST 로 간주해 잘못 변환된다.
     */
    @Override
    @SuppressWarnings("unchecked")
    public Map<LocalDate, Long> findDailySubmissionCounts(Long recruitmentId, LocalDate startDate, LocalDate endDate) {
        String nativeQuery =
                "SELECT DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul') AS submission_date, COUNT(*) AS submission_count "
                + "FROM application "
                + "WHERE recruitment_id = :recruitmentId "
                + "  AND deleted_at IS NULL "
                + "  AND DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul') BETWEEN :startDate AND :endDate "
                + "GROUP BY DATE((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul') "
                + "ORDER BY submission_date";

        List<Object[]> rows = entityManager.createNativeQuery(nativeQuery)
                .setParameter("recruitmentId", recruitmentId)
                .setParameter("startDate", startDate)
                .setParameter("endDate", endDate)
                .getResultList();

        Map<LocalDate, Long> dailySubmissionCounts = new HashMap<>();
        for (Object[] row : rows) {
            LocalDate submissionDate = ((java.sql.Date) row[0]).toLocalDate();
            long submissionCount = ((Number) row[1]).longValue();
            dailySubmissionCounts.put(submissionDate, submissionCount);
        }
        return dailySubmissionCounts;
    }

    /**
     * 면접 진입은 "현재 상태"가 아니라 "면접 단계를 밟았는가"로 센다. 상태 카운트를 그대로 더하면
     * 서류에서 곧바로 불합격한 지원까지 REJECTED 로 집계돼 면접 진입이 부풀려지기 때문에,
     * INTERVIEW_PENDING 으로 전이한 이력이 있는 지원만 센다. 다만 상태 이력이 도입되기 전에
     * 처리된 레거시 합격자는 이력이 없으므로, 면접 모집의 ACCEPTED 는 반드시 INTERVIEW_PENDING 을
     * 거친다는 FSM 성질을 근거로 현재 상태가 INTERVIEW_PENDING·ACCEPTED 인 지원도 함께 센다.
     * 이력이 여러 건인 지원이 중복되지 않도록 DISTINCT 로 집계한다.
     */
    @Override
    public long countInterviewEntered(Long recruitmentId) {
        Long interviewEnteredCount = queryFactory
                .select(application.id.countDistinct())
                .from(application)
                .leftJoin(applicationStatusHistory)
                .on(applicationStatusHistory.application.id.eq(application.id),
                        applicationStatusHistory.newStatus.eq(ApplicationStatus.INTERVIEW_PENDING))
                .where(
                        application.recruitment.id.eq(recruitmentId),
                        application.deletedAt.isNull(),
                        application.status.in(ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.ACCEPTED)
                                .or(applicationStatusHistory.id.isNotNull())
                )
                .fetchOne();
        return interviewEnteredCount == null ? 0L : interviewEnteredCount;
    }
}
