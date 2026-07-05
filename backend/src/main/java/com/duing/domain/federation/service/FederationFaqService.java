package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqService {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);

    FederationFaq getPublished(Long faqId);

    List<FederationFaqCategory> getCategories();

    String getCategoryName(Long categoryId);

    Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable);

    Long create(CreateFederationFaqCommand command);

    void update(UpdateFederationFaqCommand command);

    void delete(Long faqId);

    void reorder(ReorderFederationFaqsCommand command);

    Long createCategory(CreateFederationFaqCategoryCommand command);

    void updateCategory(UpdateFederationFaqCategoryCommand command);
}
