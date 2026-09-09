package com.duing.domain.recruitment.stats.service.dto.query;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Map;

public record StatsFunnelQuery(
        long submitted,
        Long interviewEntered,
        long accepted
) {

    /**
     * 제출·합격은 상태 분포로 세지만, 면접 진입만은 상태로 셀 수 없어 이력 기반으로 집계한
     * interviewEnteredCount 를 받는다(서류에서 곧바로 불합격한 지원을 면접 진입으로 세지 않기 위함).
     * 면접을 쓰지 않는 모집은 단계 자체가 없으므로 null 로 응답해 프론트가 2단계로 그린다.
     */
    public static StatsFunnelQuery from(Map<ApplicationStatus, Long> applicationStatusCounts,
                                        boolean useInterview,
                                        long interviewEnteredCount) {
        long submittedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.SUBMITTED, 0L);
        long onHoldCount = applicationStatusCounts.getOrDefault(ApplicationStatus.ON_HOLD, 0L);
        long interviewPendingCount = applicationStatusCounts.getOrDefault(ApplicationStatus.INTERVIEW_PENDING, 0L);
        long acceptedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.ACCEPTED, 0L);
        long rejectedCount = applicationStatusCounts.getOrDefault(ApplicationStatus.REJECTED, 0L);

        long totalSubmitted = submittedCount + onHoldCount + interviewPendingCount + acceptedCount + rejectedCount;

        Long interviewParticipants = useInterview ? interviewEnteredCount : null;

        return new StatsFunnelQuery(totalSubmitted, interviewParticipants, acceptedCount);
    }
}
