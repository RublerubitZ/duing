package com.duing.domain.joincode.controller.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 총동연 가입 링크 강제 폐기 요청. 사유는 감사 이벤트에만 남고 동아리에 통보되지 않는다.
 *
 * <p>모집 강제 마감({@code ForceCloseRecruitmentRequest})과 달리 사유가 필수다 — 운영진이 만든 링크를
 * 총동연이 끊는 조치라, 나중에 왜 끊었는지 설명할 수 없는 행이 남으면 이력이 무의미해진다.
 * 길이 상한은 {@code club_audit_event.reason} 컬럼(VARCHAR(500))과 같은 값이다.
 */
public record ForceRevokeJoinCodeRequest(
        @NotBlank(message = "폐기 사유는 필수입니다.")
        @Size(max = 500, message = "사유는 500자 이하여야 합니다.")
        String reason
) {
}
