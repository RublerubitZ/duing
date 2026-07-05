package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.command.AnswerFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.ChangeInquiryStatusCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationInquiryCommand;
import com.duing.domain.federation.service.dto.command.UpdateInquiryAnswerCommand;
import com.duing.domain.federation.service.dto.query.AdminFederationInquiryRow;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationInquiryDetailQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationInquiryService {

    Long create(CreateFederationInquiryCommand command);

    Page<FederationInquiry> listMine(Long authorId, FederationInquiryStatus status, Pageable pageable);

    FederationInquiryDetailQuery getMine(Long inquiryId, Long authorId);

    void update(UpdateFederationInquiryCommand command);

    void delete(Long inquiryId, Long authorId);

    Page<AdminFederationInquiryRow> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable);

    FederationInquiryDetailQuery getForAdmin(Long inquiryId);

    void changeStatus(ChangeInquiryStatusCommand command);

    Long answer(AnswerFederationInquiryCommand command);

    void updateAnswer(UpdateInquiryAnswerCommand command);
}
