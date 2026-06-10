package com.duing.domain.application.repository;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.service.dto.query.ApplicantNeighborsQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import java.time.LocalDateTime;
import java.util.List;

public interface ApplicationRepositoryCustom {

    /**
     * 운영진 지원자 목록 조회.
     * 정렬: createdAt DESC (최신 지원자가 위).
     * filter 의 모든 필드는 옵셔널 — null 이면 해당 조건 미적용.
     * currentUserId 에 해당하는 운영진의 평가 점수를 myScore 로 함께 반환한다 (없으면 null).
     * ASSIGNED InterviewSchedule 이 가리키는 슬롯의 startTime 을 interviewStartAt 으로 반환한다
     * (없거나 CANCELLED 면 null).
     */
    List<ApplicantWithScore> searchApplicants(Long recruitmentId, Long currentUserId, ApplicantSearchCondition condition);

    /**
     * 동일 필터 컨텍스트에서 createdAt desc 정렬 기준 prev/next applicationId 를 반환한다.
     * prev = pivot 보다 createdAt 이 큰 (더 최근, UI 상 위) 것 중 가장 가까운 것.
     * next = pivot 보다 createdAt 이 작은 (더 오래된, UI 상 아래) 것 중 가장 가까운 것.
     * 해당 방향의 이웃이 없으면 null 을 반환한다.
     */
    ApplicantNeighborsQuery findNeighbors(Long recruitmentId, Long applicationId, ApplicantSearchCondition condition);

    record ApplicantWithScore(Application application, LocalDateTime interviewStartAt, Integer myScore) {}
}
