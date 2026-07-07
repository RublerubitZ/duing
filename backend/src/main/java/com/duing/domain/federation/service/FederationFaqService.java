package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import com.duing.domain.federation.service.dto.command.DeleteFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import com.duing.domain.federation.service.dto.command.SubmitFederationFaqFeedbackCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FederationFaqService {

    Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable);

    FederationFaq getPublished(Long faqId);

    List<FederationFaqCategory> getCategories();

    String getCategoryName(Long categoryId);

    Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable);

    /** admin FAQ 목록 전용 — faqId → {helpful: count} 집계(카운트 없는 faqId는 결과에서 생략). */
    Map<Long, Map<Boolean, Long>> getFeedbackCounts(Collection<Long> faqIds);

    Long create(CreateFederationFaqCommand command);

    void update(UpdateFederationFaqCommand command);

    void delete(Long faqId);

    void reorder(ReorderFederationFaqsCommand command);

    Long createCategory(CreateFederationFaqCategoryCommand command);

    void updateCategory(UpdateFederationFaqCategoryCommand command);

    void deleteCategory(DeleteFederationFaqCategoryCommand command);

    void submitFeedback(SubmitFederationFaqFeedbackCommand command);

    /** admin 무결과 검색어 목록 — 정렬은 miss_count 내림차순·last_searched_at 내림차순 고정(클라이언트 sort 무시). */
    Page<FederationFaqSearchMiss> getSearchMisses(Pageable pageable);
}
