package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqRepositoryCustom {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);

    Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable);
}
