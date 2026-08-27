package com.duing.domain.club.metric.repository;

/** {@code ClubViewEventRepository.aggregateInterest()} native 집계의 인터페이스 프로젝션. */
public interface ClubInterestSourceRow {

    Long getClubId();

    /** 창 안에서 이 동아리를 본 서로 다른 방문자 수 — 감쇠 없는 실제 사람 수(화면 표시용). */
    int getWeeklyVisitorCount();

    /** 일별 순방문자에 최근성 감쇠를 적용해 합산한 정렬용 점수. */
    double getInterestScore();
}
