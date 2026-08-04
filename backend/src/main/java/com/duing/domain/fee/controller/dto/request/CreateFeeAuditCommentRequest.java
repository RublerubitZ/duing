package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import com.duing.domain.fee.service.dto.command.CreateFeeAuditCommentCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 감사 의견·메모 생성(스펙 §7.10). 의견의 status 는 생략 시 OPEN 이 부여되고, 메모에 실어 보내면 400 이다. */
public record CreateFeeAuditCommentRequest(
        @NotNull(message = "종류를 선택해 주세요.") FeeAuditCommentKind kind,
        FeeAuditCommentStatus status,
        @NotBlank(message = "내용을 입력해 주세요.")
        @Size(max = 2000, message = "내용은 2000자 이하여야 합니다.") String content) {

    public CreateFeeAuditCommentCommand toCommand(Long clubId, Long authorUserId) {
        return new CreateFeeAuditCommentCommand(clubId, authorUserId, kind, status, content);
    }
}
