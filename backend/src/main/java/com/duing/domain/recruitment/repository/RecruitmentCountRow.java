package com.duing.domain.recruitment.repository;

/**
 * 모집별 건수 묶음 집계를 받는 Spring Data interface projection — 자동 마감을 막는 결과 없는 지원 수와 진행 중
 * 면접 라운드 수를 모집 id 들로 한 번에 셀 때 쓴다(ApplicationRepository·InterviewRoundRepository).
 * 건수가 0 인 모집은 행이 없다.
 */
public interface RecruitmentCountRow {

    Long getRecruitmentId();

    Long getItemCount();
}
