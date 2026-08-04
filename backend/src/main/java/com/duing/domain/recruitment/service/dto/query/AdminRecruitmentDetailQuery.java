package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;

/**
 * 관리자 모집 상세 조회 결과 — 목록과 같은 공통 행에 외부 폼 모집의 가입 링크 현황을 얹는다.
 *
 * <p>{@code joinCode} 와 {@code joinLinkStatus} 는 EXTERNAL 모집에 활성 코드가 있을 때만 채워진다.
 * 폐기된 코드는 활성 조회에서 이미 빠지므로 둘이 비어 있으면 화면은 "코드 없음"으로 읽는다.
 * 링크 상태는 LAZY 연관(코드 → 모집)을 트랜잭션 밖에서 건드리지 않도록 서비스에서 미리 판정한다.
 */
public record AdminRecruitmentDetailQuery(
        AdminRecruitmentRow recruitmentRow,
        JoinCodeQuery joinCode,
        String joinLinkStatus
) {
}
