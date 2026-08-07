package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.FeeAuditCommentStatus;

/** 감사 의견·메모 부분 수정(스펙 §7.10). null 필드는 기존 값을 유지한다. */
public record UpdateFeeAuditCommentCommand(
        Long clubId, Long commentId, String content, FeeAuditCommentStatus status
) {
}
