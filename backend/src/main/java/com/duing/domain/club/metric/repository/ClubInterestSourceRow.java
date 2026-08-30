package com.duing.domain.club.metric.repository;

/** {@code ClubViewEventRepository.aggregateInterest()} native 집계의 인터페이스 프로젝션. */
public interface ClubInterestSourceRow {

    Long getClubId();

    /** 창 안에서 이 동아리를 본 서로 다른 방문자 수 — 감쇠 없는 실제 사람 수(화면 표시용). */
    int getWeeklyVisitorCount();

    /**
     * 창 안 조회에 최근성 감쇠를 적용해 합산한 값 — 정렬 점수 자체가 아니라 그 두 축 중 하나다.
     * 최종 {@code interest_score} 는 {@code ClubInterestPolicy.interestScore} 가 순방문자 수와 합성한다.
     */
    double getDecayedVisitScore();
}
