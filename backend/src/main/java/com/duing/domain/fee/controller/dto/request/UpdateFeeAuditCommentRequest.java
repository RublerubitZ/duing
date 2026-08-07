package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import com.duing.domain.fee.service.dto.command.UpdateFeeAuditCommentCommand;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 감사 의견·메모 부분 수정(스펙 §7.10). 미전송(null) 필드는 기존 값을 유지한다. */
public record UpdateFeeAuditCommentRequest(
        // 전송 시 공백만으로 기존 내용을 덮어쓰는 것만 막는다. 내용은 여러 줄일 수 있어 (?s)(DOTALL)로 개행을 허용한다.
        @Pattern(regexp = "(?s)^\\s*\\S.*$", message = "내용은 공백일 수 없습니다.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.") String content,
        FeeAuditCommentStatus status) {

    public UpdateFeeAuditCommentCommand toCommand(Long clubId, Long commentId) {
        return new UpdateFeeAuditCommentCommand(clubId, commentId, content, status);
    }
}
