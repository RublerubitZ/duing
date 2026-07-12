package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryDetailQuery;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryQuery;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryAttachmentDownload;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import com.duing.domain.user.entity.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationInquiryService {

    Long create(CreateFederationInquiryCommand command);

    Page<FederationInquiry> listMine(Long authorId, FederationInquiryStatus status, Pageable pageable);

    FederationInquiryDetailQuery getMine(Long inquiryId, Long authorId);

    // 작성자 본인 또는 ADMIN 만 — 그 외(미존재·타 학생·soft deleted)는 전부 404(존재 은닉).
    FederationInquiryAttachmentDownload downloadAttachment(
            Long inquiryId, Long attachmentId, Long currentUserId, UserRole currentUserRole);

    void update(UpdateFederationInquiryCommand command);

    void delete(Long inquiryId, Long authorId);

    Page<AdminFederationInquiryQuery> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable);

    AdminFederationInquiryDetailQuery getForAdmin(Long inquiryId);

    void changeStatus(ChangeInquiryStatusCommand command);

    Long answer(AnswerFederationInquiryCommand command);

    void updateAnswer(UpdateInquiryAnswerCommand command);
}
