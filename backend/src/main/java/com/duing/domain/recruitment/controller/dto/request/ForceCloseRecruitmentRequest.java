package com.duing.domain.recruitment.controller.dto.request;

import jakarta.validation.constraints.Size;

/**
 * 총동연 강제 마감 요청. 사유는 선택 입력이며 감사 이벤트에만 남는다(동아리에 통보되지 않는다).
 * 길이 상한은 {@code club_audit_event.reason} 컬럼(VARCHAR(500))과 같은 값이다.
 */
public record ForceCloseRecruitmentRequest(
        @Size(max = 500, message = "사유는 500자 이하여야 합니다.")
        String reason
) {
}
