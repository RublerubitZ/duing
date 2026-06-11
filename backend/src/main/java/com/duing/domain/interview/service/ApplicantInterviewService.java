package com.duing.domain.interview.service;

import com.duing.domain.interview.service.dto.query.ApplicantInterviewView;

public interface ApplicantInterviewService {

    /**
     * 지원자 본인의 면접 진행 단계(applicantPhase)와 phase 별 화면 데이터를 조회한다 (스펙 §9.2 API 13).
     * raw member/round status 는 노출하지 않는다 — 파생은 서버 단독(SSOT, §9.3).
     */
    ApplicantInterviewView getMyInterview(Long applicationId, Long currentUserId);
}
