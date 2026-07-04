package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqService {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);

    FederationFaq getPublished(Long faqId);

    List<FederationFaqCategory> getCategories();
}
