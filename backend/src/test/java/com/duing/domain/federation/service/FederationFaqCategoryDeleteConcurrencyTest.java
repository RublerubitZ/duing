package com.duing.domain.federation.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.exception.FederationFaqException;
import com.duing.domain.federation.repository.FederationFaqCategoryRepository;
import com.duing.domain.federation.repository.FederationFaqRepository;
import com.duing.domain.federation.service.dto.command.CreateFederationFaqCommand;
import com.duing.domain.federation.service.dto.command.DeleteFederationFaqCategoryCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FederationFaqCategoryDeleteConcurrencyTest extends IntegrationTestBase {

    @Autowired FederationFaqService federationFaqService;
    @Autowired FederationFaqRepository faqRepository;
    @Autowired FederationFaqCategoryRepository categoryRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("A→B 이관 삭제와 B→A 이관 삭제가 동시에 실행돼도 교착 없이 완료되고 살아있는 FAQ는 전부 살아있는 카테고리를 참조한다")
    void crossReassignDeletesCompleteWithoutDeadlock() throws Exception {
        Long authorId = saveUser().getId();
        Long categoryAId = saveCategory(0);
        Long categoryBId = saveCategory(1);
        seedFaq(categoryAId, authorId);
        seedFaq(categoryBId, authorId);

        List<Throwable> failures = runConcurrently(
                () -> federationFaqService.deleteCategory(
                        new DeleteFederationFaqCategoryCommand(categoryAId, categoryBId)),
                () -> federationFaqService.deleteCategory(
                        new DeleteFederationFaqCategoryCommand(categoryBId, categoryAId)));

        // id 오름차순 잠금으로 두 트랜잭션 모두 같은 행(min id)부터 잠가 완전 직렬화된다 —
        // 먼저 잠근 쪽만 성공하고, 나머지는 이미 삭제된 카테고리를 보고 404.
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0))
                .isInstanceOf(FederationFaqException.FederationFaqCategoryNotFoundException.class);

        // 불변식: 두 카테고리 중 정확히 1개 살아남고, 살아있는 FAQ 2건 모두 그 카테고리를 참조한다(고아 0).
        // 카테고리 테이블은 V73 시드 보존 때문에 truncate 대상이 아니라, 이 테스트가 만든 두 건으로 좁혀 센다.
        List<FederationFaqCategory> liveCategories =
                categoryRepository.findAllById(List.of(categoryAId, categoryBId));
        assertThat(liveCategories).hasSize(1);
        List<FederationFaq> liveFaqs = faqRepository.findAll();
        assertThat(liveFaqs).hasSize(2);
        assertThat(liveFaqs)
                .extracting(FederationFaq::getCategoryId)
                .containsOnly(liveCategories.get(0).getId());
    }

    @Test
    @DisplayName("FAQ 생성과 카테고리 삭제가 동시에 실행돼도 삭제된 카테고리를 참조하는 살아있는 FAQ는 생기지 않는다")
    void createVersusDeleteLeavesNoOrphanFaq() throws Exception {
        Long authorId = saveUser().getId();
        Long categoryId = saveCategory(0);

        List<Throwable> failures = runConcurrently(
                () -> federationFaqService.create(new CreateFederationFaqCommand(
                        categoryId, "동시성 질문", "동시성 답변", false, true, authorId)),
                () -> federationFaqService.deleteCategory(
                        new DeleteFederationFaqCategoryCommand(categoryId, null)));

        // requireCategory와 deleteCategory가 같은 행 잠금으로 직렬화 — 생성이 먼저면 삭제가 FAQ를 보고 409,
        // 삭제가 먼저면 생성이 @SQLRestriction에 걸러진 빈 결과를 보고 404. 어느 쪽이 이기든 한쪽만 성공한다.
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0)).isInstanceOfAny(
                FederationFaqException.FederationFaqCategoryInUseException.class,
                FederationFaqException.FederationFaqCategoryNotFoundException.class);

        // 불변식: 살아있는 FAQ가 삭제된 카테고리를 참조하는 경우 0건.
        Set<Long> liveCategoryIds = categoryRepository.findAll().stream()
                .map(FederationFaqCategory::getId)
                .collect(Collectors.toSet());
        List<FederationFaq> orphanFaqs = faqRepository.findAll().stream()
                .filter(faq -> !liveCategoryIds.contains(faq.getCategoryId()))
                .toList();
        assertThat(orphanFaqs).as("삭제된 카테고리를 참조하는 살아있는 FAQ").isEmpty();
    }

    // 두 작업을 latch로 동시에 시작시키고, 각 스레드의 예외를 수집해 반환한다 (TransferLeaderConcurrencyTest 전례).
    private List<Throwable> runConcurrently(Runnable firstTask, Runnable secondTask) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        List<Throwable> failures = new CopyOnWriteArrayList<>();
        executor = Executors.newFixedThreadPool(2);
        for (Runnable task : List.of(firstTask, secondTask)) {
            executor.submit(() -> {
                try {
                    start.await();
                    task.run();
                } catch (Throwable failure) {
                    failures.add(failure);
                } finally {
                    done.countDown();
                }
            });
        }
        start.countDown();
        // 교착이 생기면 이 대기가 끝나지 않는다 — id 오름차순 잠금 규칙의 회귀 감시 지점.
        assertThat(done.await(10, TimeUnit.SECONDS)).as("두 트랜잭션이 교착 없이 완료").isTrue();
        return failures;
    }

    private Long saveCategory(int sortOrder) {
        return categoryRepository.save(
                FederationFaqCategory.create("동시성카테고리" + sequence.incrementAndGet(), sortOrder)).getId();
    }

    private void seedFaq(Long categoryId, Long authorId) {
        faqRepository.save(FederationFaq.create(
                categoryId, "질문" + sequence.incrementAndGet(), "답변 본문입니다.", false, true, 0, authorId));
    }

    private User saveUser() {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                "20" + unique, "테스터" + unique,
                "hashed", UserRole.ADMIN, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
    }
}
