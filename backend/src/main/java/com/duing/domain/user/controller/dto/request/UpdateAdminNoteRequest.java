package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.service.dto.command.UpdateAdminNoteCommand;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "관리자 메모 저장 요청")
public record UpdateAdminNoteRequest(
        @Schema(description = "메모 본문. 비우려면 빈 문자열을 보낸다(null 불가).", example = "테스트 계정")
        @NotNull(message = "메모는 필수입니다. 비우려면 빈 문자열을 보내주세요.")
        @Size(max = 1000, message = "메모는 1000자 이하로 입력해주세요.")
        String note
) {
    public UpdateAdminNoteCommand toCommand(Long targetUserId, Long actorUserId) {
        return new UpdateAdminNoteCommand(targetUserId, actorUserId, note);
    }
}
