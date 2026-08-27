package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.exception.FederationFaqException;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqFeedbackRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.repository.FederationFaqSearchMissRepository;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.command.UpdateFederationFaqCategoryCommand;
import java.sql.SQLException;
import java.time.Clock;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * 선조회(existsByName)를 함께 통과한 동시 FAQ 카테고리 생성·개명 경합이 전역 핸들러의 generic 409 가
 * 아니라 사전 검사와 같은 중복 이름 409 로 표면화되는지 고정한다 (PR-10, uq_federation_faq_category_name V73).
 */
class FederationFaqCategoryRaceGuardTest {

    private final FederationFaqCategoryRepository categoryRepository =
            mock(FederationFaqCategoryRepository.class);
    private final GeneralFederationFaqService faqService = new GeneralFederationFaqService(
            mock(FederationFaqRepository.class),
            categoryRepository,
            mock(FederationFaqFeedbackRepository.class),
            mock(FederationFaqSearchMissRepository.class),
            // 이 테스트가 다루는 카테고리 경합 경로는 리미터·시계를 타지 않는다 — 생성자 시그니처만 맞춘다.
            mock(FederationFaqFeedbackRateLimiter.class),
            Clock.systemUTC());

    @Test
    @DisplayName("선조회를 함께 통과한 동시 카테고리 생성이 unique 인덱스에 걸리면 사전 검사와 같은 중복 이름 409 로 표면화된다")
    void racedCategoryCreateSurfacesAsDuplicateName() {
        when(categoryRepository.existsByName("가입 안내")).thenReturn(false);
        when(categoryRepository.findMaxSortOrder()).thenReturn(0);
        when(categoryRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(uniqueViolation("uq_federation_faq_category_name")).when(categoryRepository).flush();

        assertThatThrownBy(() -> faqService.createCategory(new CreateFederationFaqCategoryCommand("가입 안내")))
                .isInstanceOf(FederationFaqException.DuplicateFederationFaqCategoryNameException.class);
    }

    @Test
    @DisplayName("카테고리 생성 경로의 다른 제약 위반은 중복 이름 409 로 둔갑하지 않고 그대로 전파된다")
    void unrelatedViolationIsRethrown() {
        when(categoryRepository.existsByName("가입 안내")).thenReturn(false);
        when(categoryRepository.findMaxSortOrder()).thenReturn(0);
        when(categoryRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        DataIntegrityViolationException foreignViolation = uniqueViolation("uk_other_constraint");
        doThrow(foreignViolation).when(categoryRepository).flush();

        assertThatThrownBy(() -> faqService.createCategory(new CreateFederationFaqCategoryCommand("가입 안내")))
                .isSameAs(foreignViolation);
    }

    @Test
    @DisplayName("선조회를 함께 통과한 동시 카테고리 개명이 unique 인덱스에 걸리면 사전 검사와 같은 중복 이름 409 로 표면화된다")
    void racedCategoryRenameSurfacesAsDuplicateName() {
        when(categoryRepository.findByIdForUpdate(1L))
                .thenReturn(Optional.of(FederationFaqCategory.create("기존 이름", 1)));
        when(categoryRepository.existsByName("새 이름")).thenReturn(false);
        doThrow(uniqueViolation("uq_federation_faq_category_name")).when(categoryRepository).flush();

        assertThatThrownBy(() -> faqService.updateCategory(
                new UpdateFederationFaqCategoryCommand(1L, "새 이름", 1)))
                .isInstanceOf(FederationFaqException.DuplicateFederationFaqCategoryNameException.class);
    }

    private static DataIntegrityViolationException uniqueViolation(String constraintName) {
        return new DataIntegrityViolationException("wrapper", new SQLException(
                "duplicate key value violates unique constraint \"" + constraintName + "\"", "23505"));
    }
}
