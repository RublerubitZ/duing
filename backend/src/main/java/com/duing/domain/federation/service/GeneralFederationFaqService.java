package com.duing.domain.federation.service;

import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.domain.federation.exception.FederationFaqException;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqFeedbackRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.repository.FederationFaqSearchMissRepository;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import com.duing.domain.federation.service.dto.command.DeleteFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.ReorderFederationFaqsCommand;
import com.duing.domain.federation.service.dto.command.SubmitFederationFaqFeedbackCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCommand;
import com.duing.domain.federation.service.dto.query.FaqFeedbackCount;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFederationFaqService implements FederationFaqService {

    private final FederationFaqRepository federationFaqRepository;
    private final FederationFaqCategoryRepository categoryRepository;
    private final FederationFaqFeedbackRepository feedbackRepository;
    private final FederationFaqSearchMissRepository searchMissRepository;

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
    public Map<Long, Map<Boolean, Long>> getFeedbackCounts(Collection<Long> faqIds) {
        // 빈 페이지(검색 결과 없음)에서 IN() 빈 컬렉션 호출을 생략한다 (InterviewRoundService.getRounds() 전례).
        if (faqIds.isEmpty()) {
            return Map.of();
        }
        return feedbackRepository.countGroupedByFaqIdAndHelpful(faqIds).stream()
                .collect(Collectors.groupingBy(FaqFeedbackCount::faqId,
                        Collectors.toMap(FaqFeedbackCount::helpful, FaqFeedbackCount::count)));
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
        // 삭제와 같은 잠금 프로토콜 참여 — 잠금 없는 findById로는 "수정 조회 → 삭제 커밋 → 삭제된 행에 이름/순서
        // UPDATE 후 204"의 stale write가 가능하다(카테고리는 @Version이 없어 낙관락 방어도 없음).
        // 잠그면 삭제가 먼저 커밋된 경우 @SQLRestriction에 걸러진 빈 결과로 404에 수렴한다.
        FederationFaqCategory category = categoryRepository.findByIdForUpdate(command.categoryId())
                .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
        if (!category.getName().equals(command.name()) && categoryRepository.existsByName(command.name())) {
            throw new FederationFaqException.DuplicateFederationFaqCategoryNameException();
        }
        category.update(command.name(), command.sortOrder());
    }

    @Override
    @Transactional
    public void deleteCategory(DeleteFederationFaqCategoryCommand command) {
        Long categoryId = command.categoryId();
        Long moveToCategoryId = command.moveToCategoryId();
        boolean reassigning = moveToCategoryId != null;

        // 1. 잠금 전 선검증 — 자기 자신 이관은 요청 자체가 모순이므로 잠금보다 먼저 걸러낸다.
        if (reassigning && moveToCategoryId.equals(categoryId)) {
            throw new FederationFaqException.InvalidCategoryMoveTargetException();
        }

        // 2. 잠금 획득. 이관이면 두 카테고리 행을 id 오름차순으로 순차 잠근다 — A→B 삭제와 B→A 삭제가
        // 동시에 실행될 때 정렬 없이 잠그면 서로 반대 순서로 잠가 교착(deadlock)에 빠질 수 있다.
        // 원본 엔티티는 삭제 대상이므로 정렬된 두 결과 중 categoryId와 일치하는 쪽을 구분해 보관한다.
        FederationFaqCategory category;
        if (reassigning) {
            Long smallerId = Math.min(categoryId, moveToCategoryId);
            Long largerId = Math.max(categoryId, moveToCategoryId);
            FederationFaqCategory smaller = categoryRepository.findByIdForUpdate(smallerId)
                    .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
            FederationFaqCategory larger = categoryRepository.findByIdForUpdate(largerId)
                    .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
            category = smallerId.equals(categoryId) ? smaller : larger;
        } else {
            category = categoryRepository.findByIdForUpdate(categoryId)
                    .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
        }

        // 3. 이관 미지정 시 FAQ 존재 여부 검사 — 사용 중이라 삭제 불가(선행조건 위반)는 409.
        if (!reassigning && federationFaqRepository.existsByCategoryId(categoryId)) {
            throw new FederationFaqException.FederationFaqCategoryInUseException();
        }

        // 4. 이관 지정 시 일괄 이관(카테고리가 비어 있어도 no-op으로 안전).
        if (reassigning) {
            federationFaqRepository.reassignCategory(categoryId, moveToCategoryId);
        }

        // 5. soft delete — reassignCategory의 clearAutomatically로 category가 detached 상태라 Spring Data가
        // merge(재SELECT) 후 remove하는 폴백을 타지만, DB 행 잠금은 트랜잭션 끝까지 유지되고 @SQLDelete가 정상 적용된다.
        categoryRepository.delete(category);
    }

    @Override
    @Transactional
    public void submitFeedback(SubmitFederationFaqFeedbackCommand command) {
        // 발행된 FAQ만 대상 — 비공개·미존재 모두 404(공개 단건 조회 규칙과 동일).
        FederationFaq faq = getPublished(command.faqId());
        if (command.userId() != null) {
            feedbackRepository.upsertByFaqIdAndUserId(faq.getId(), command.userId(), command.helpful());
            return;
        }
        if (!StringUtils.hasText(command.sessionKey())) {
            throw new FederationFaqException.FaqFeedbackSessionKeyRequiredException();
        }
        feedbackRepository.upsertByFaqIdAndSessionKey(faq.getId(), command.sessionKey(), command.helpful());
    }

    @Override
    public Page<FederationFaqSearchMiss> getSearchMisses(Pageable pageable) {
        // 클라이언트가 보낸 sort는 무시하고 정렬을 서버가 고정한다 — 갭 신호의 우선순위는 검색 횟수(miss_count)이고,
        // admin 화면 계약을 단순화하기 위해 정렬 파라미터 자체를 지원하지 않는다(YAGNI).
        Pageable fixedSortPageable = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                Sort.by(Sort.Order.desc("missCount"), Sort.Order.desc("lastSearchedAt")));
        return searchMissRepository.findAll(fixedSortPageable);
    }

    private FederationFaq getFaqForAdmin(Long faqId) {
        return federationFaqRepository.findById(faqId)
                .orElseThrow(FederationFaqException.FederationFaqNotFoundException::new);
    }

    private void requireCategory(Long categoryId) {
        // FAQ 생성·수정 트랜잭션 안에서 카테고리 유효성을 잠금 조회로 재검증한다 — FederationFaq 엔티티 주석이
        // 예약해둔 삭제 경합 잠금(PESSIMISTIC_WRITE)의 이행이다. existsById(잠금 없음)로는 "존재 검사 통과 →
        // 카테고리 삭제 커밋 → 고아 FAQ 삽입" 레이스가 남는다. 잠그면 두 시나리오 모두 수렴한다:
        // FAQ 생성/수정이 먼저면 삭제 트랜잭션이 대기했다가 실제 FAQ를 보고 409, 삭제가 먼저 커밋되면
        // 생성/수정이 대기했다가 @SQLRestriction에 걸러진 빈 결과로 404.
        categoryRepository.findByIdForUpdate(categoryId)
                .orElseThrow(FederationFaqException.FederationFaqCategoryNotFoundException::new);
    }
}
