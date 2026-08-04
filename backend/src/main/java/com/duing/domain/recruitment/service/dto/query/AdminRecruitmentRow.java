package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;

/**
 * 관리자 모집 목록·상세의 공통 행. 지원자 수는 모집 방식과 무관하게 실제 지원서를 센 값이다.
 *
 * <p>{@code clubName} 을 따로 들고 있는 이유: 목록 쿼리가 동아리를 fetch join 하지 않고 이름만
 * 스칼라로 뽑기 때문이다(집계 groupBy 와 병용 불가). 응답 매핑은 이 값을 쓰고 LAZY 연관을 건드리지 않는다.
 */
public record AdminRecruitmentRow(
        Recruitment recruitment,
        String clubName,
        long applicantCount
) {
    /**
     * 화면에 내보낼 지원자 수. 외부 폼 모집은 두잉에 지원 데이터가 애초에 없으므로 0 이 아니라
     * "해당 없음"(null)이다 — 화면은 이를 "—" 로 표시한다.
     */
    public Long visibleApplicantCount() {
        return recruitment.getApplicationMode() == ApplicationMode.EXTERNAL ? null : applicantCount;
    }
}
