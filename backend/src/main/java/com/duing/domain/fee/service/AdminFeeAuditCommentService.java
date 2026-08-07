package com.duing.domain.fee.service;

import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.service.dto.command.CreateFeeAuditCommentCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeeAuditCommentCommand;
import com.duing.domain.fee.service.dto.query.AdminFeeAuditCommentRow;
import java.util.List;

/** 총동연 감사 의견·운영 메모 CRUD(스펙 §7.10). ADMIN 전용이라 동아리 측 진입점은 없다. */
public interface AdminFeeAuditCommentService {

    Long create(CreateFeeAuditCommentCommand command);

    /** kind 생략(null)이면 의견·메모를 함께, 최신순으로 반환한다. */
    List<AdminFeeAuditCommentRow> getComments(Long clubId, FeeAuditCommentKind kind);

    void update(UpdateFeeAuditCommentCommand command);

    void delete(Long clubId, Long commentId);
}
