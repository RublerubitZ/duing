package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "계정 상태 변경 요청")
public record ChangeUserStatusRequest(
        @Schema(description = "변경할 상태", example = "SUSPENDED")
        @NotNull(message = "변경할 상태는 필수입니다.")
        UserStatus status,

        @Schema(description = "정지·해제 사유(감사 로그에 기록된다)", example = "커뮤니티 신고 3건 누적")
        @NotBlank(message = "사유는 필수입니다.")
        @Size(max = 200, message = "사유는 200자 이하로 입력해주세요.")
        String reason
) {
    public ChangeUserStatusCommand toCommand(Long targetUserId, Long actorUserId) {
        return new ChangeUserStatusCommand(targetUserId, actorUserId, status, reason.trim());
    }
}
