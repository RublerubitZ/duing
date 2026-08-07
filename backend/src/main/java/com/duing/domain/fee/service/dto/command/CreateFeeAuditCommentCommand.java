package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;

/** 감사 의견·메모 생성(스펙 §7.10). status 는 의견에서만 쓰이고 생략 시 OPEN 이 부여된다. */
public record CreateFeeAuditCommentCommand(
        Long clubId, Long authorUserId, FeeAuditCommentKind kind,
        FeeAuditCommentStatus status, String content
) {
}
