package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.domain.federation.service.dto.query.FederationInquiryAdminSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationInquiryRepositoryCustom {

    Page<FederationInquiry> searchMine(Long authorId, FederationInquiryStatus status, Pageable pageable);

    Page<FederationInquiry> searchForAdmin(FederationInquiryAdminSearchCondition condition, Pageable pageable);
}
