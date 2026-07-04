package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.exception.FederationFaqException;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFederationFaqService implements FederationFaqService {

    private final FederationFaqRepository federationFaqRepository;
    private final FederationFaqCategoryRepository categoryRepository;

    @Override
    public Page<FederationFaq> searchPublished(FederationFaqSearchCondition condition, Pageable pageable) {
        return federationFaqRepository.searchPublished(condition, pageable);
    }

    @Override
    public FederationFaq getPublished(Long faqId) {
        // 비공개(is_published=false)도 404 — 존재 여부를 노출하지 않는다 (스펙 §5 공개 단건).
        return federationFaqRepository.findById(faqId)
                .filter(FederationFaq::isPublished)
                .orElseThrow(FederationFaqException.FederationFaqNotFoundException::new);
    }

    @Override
    public List<FederationFaqCategory> getCategories() {
        return categoryRepository.findAllByOrderBySortOrderAscIdAsc();
    }

    @Override
    public String getCategoryName(Long categoryId) {
        return categoryRepository.findById(categoryId)
                .map(FederationFaqCategory::getName)
                .orElse(null);
    }

    @Override
    public Page<FederationFaq> searchForAdmin(FederationFaqAdminSearchCondition condition, Pageable pageable) {
        return federationFaqRepository.searchForAdmin(condition, pageable);
    }

    @Override
    @Transactional
    public Long create(CreateFederationFaqCommand command) {
        requireCategory(command.categoryId());
        FederationFaq faq = FederationFaq.create(
                command.categoryId(), command.question(), command.answer(),
                command.pinned(), command.published(),
                federationFaqRepository.findMaxSortOrder() + 1,  // 신규는 맨 뒤 자동 배치 (스펙 §5)
                command.authorId());
        return federationFaqRepository.save(faq).getId();
    }

    @Override
    @Transactional
    public void update(UpdateFederationFaqCommand command) {
        FederationFaq faq = getFaqForAdmin(command.faqId());
        requireCategory(command.categoryId());
        faq.update(command.categoryId(), command.question(), command.answer(),
                command.pinned(), command.published());
    }

    @Override
    @Transactional
    public void delete(Long faqId) {
        FederationFaq faq = getFaqForAdmin(faqId);
        federationFaqRepository.delete(faq);  // @SQLDelete soft delete
    }

    @Override
    @Transactional
    public void reorder(ReorderFederationFaqsCommand command) {
        List<FederationFaq> currentFaqs = federationFaqRepository.findAll();
        Set<Long> currentIds = currentFaqs.stream().map(FederationFaq::getId).collect(Collectors.toSet());
        List<Long> orderedIds = command.orderedIds();
        // 전체 교체 계약: 현재 전체 id 집합과 payload 가 정확히 일치해야 한다 (ClubPhoto reorder 전례)
        // Set.copyOf 는 중복/null 원소에 예외(500)를 던지므로, 이를 관용하는 HashSet 비교로 400 경로를 보장한다.
        if (orderedIds.size() != currentIds.size() || !currentIds.equals(new HashSet<>(orderedIds))) {
            throw new FederationFaqException.FaqOrderMismatchException();
        }
        Map<Long, FederationFaq> faqById = currentFaqs.stream()
                .collect(Collectors.toMap(FederationFaq::getId, faq -> faq));
        for (int index = 0; index < orderedIds.size(); index++) {
            faqById.get(orderedIds.get(index)).changeSortOrder(index);
        }
    }

    @Override
    @Transactional
    public Long createCategory(CreateFederationFaqCategoryCommand command) {
        // 사전 중복 검사(친절한 409) + DB partial unique 인덱스가 최종 백스톱
        if (categoryRepository.existsByName(command.name())) {
            throw new FederationFaqException.DuplicateFederationFaqCategoryNameException();
        }
        FederationFaqCategory category = FederationFaqCategory.create(
                command.name(), categoryRepository.findMaxSortOrder() + 1);
        return categoryRepository.save(category).getId();
    }

    @Override
    @Transactional
    public void updateCategory(UpdateFederationFaqCategoryCommand command) {
        FederationFaqCategory category = categoryRepository.findById(command.categoryId())
                .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
        if (!category.getName().equals(command.name()) && categoryRepository.existsByName(command.name())) {
            throw new FederationFaqException.DuplicateFederationFaqCategoryNameException();
        }
        category.update(command.name(), command.sortOrder());
    }

    private FederationFaq getFaqForAdmin(Long faqId) {
        return federationFaqRepository.findById(faqId)
                .orElseThrow(FederationFaqException.FederationFaqNotFoundException::new);
    }

    private void requireCategory(Long categoryId) {
        // FAQ 생성·수정 트랜잭션 안에서 카테고리 유효성 재검증 (스펙 §4 — @SQLRestriction이 삭제 카테고리를 걸러줌)
        if (!categoryRepository.existsById(categoryId)) {
            throw new FederationFaqException.FederationFaqCategoryNotFoundException();
        }
    }
}
