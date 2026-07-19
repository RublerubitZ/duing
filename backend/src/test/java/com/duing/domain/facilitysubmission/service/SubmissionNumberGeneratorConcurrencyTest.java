package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import java.time.LocalDate;
import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class SubmissionNumberGeneratorConcurrencyTest extends IntegrationTestBase {

    @Autowired SubmissionNumberGenerator numberGenerator;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("같은 날짜의 제출번호는 001부터 순차 발급된다")
    void sequentialNumbersStartFrom001() {
        LocalDate submissionDate = LocalDate.now();
        String datePart = submissionDate.format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE);

        String first = transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate));
        String second = transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate));

        assertThat(first).isEqualTo("SUB-" + datePart + "-001");
        assertThat(second).isEqualTo("SUB-" + datePart + "-002");
    }

    @Test
    @DisplayName("다른 날짜는 카운터가 분리되어 각각 001부터 시작한다")
    void differentDatesHaveIndependentCounters() {
        LocalDate today = LocalDate.now();
        LocalDate tomorrow = today.plusDays(1);

        transactionTemplate.execute(status -> numberGenerator.nextNumber(today));
        String tomorrowFirst = transactionTemplate.execute(status -> numberGenerator.nextNumber(tomorrow));

        assertThat(tomorrowFirst).endsWith("-001");
    }

    @Test
    @DisplayName("동시 채번 10건에서도 제출번호가 중복 없이 연속 발급된다")
    void tenConcurrentRequestsProduceDistinctNumbers() throws InterruptedException {
        LocalDate submissionDate = LocalDate.now();
        Queue<String> issuedNumbers = new ConcurrentLinkedQueue<>();

        List<Throwable> failures = runConcurrently(10, () -> issuedNumbers.add(
                transactionTemplate.execute(status -> numberGenerator.nextNumber(submissionDate))));

        assertThat(failures).as("행잠금 채번은 경합에서도 실패가 없어야 한다").isEmpty();
        assertThat(issuedNumbers).hasSize(10).doesNotHaveDuplicates();
    }

    /** AuthRefreshConcurrencyTest 의 동시 실행 헬퍼를 복제한다(사이드 파일 패턴 일치). */
    private List<Throwable> runConcurrently(int threadCount, Runnable action) throws InterruptedException {
        ExecutorService executorService = Executors.newFixedThreadPool(threadCount);
        CountDownLatch readyLatch = new CountDownLatch(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        for (int i = 0; i < threadCount; i++) {
            executorService.submit(() -> {
                readyLatch.countDown();
                try {
                    startLatch.await();
                    action.run();
                } catch (Throwable throwable) {
                    failures.add(throwable);
                } finally {
                    doneLatch.countDown();
                }
            });
        }
        assertThat(readyLatch.await(10, TimeUnit.SECONDS)).isTrue();
        startLatch.countDown();
        assertThat(doneLatch.await(30, TimeUnit.SECONDS))
                .as("동시 작업이 제한시간 안에 끝나야 한다(데드락 의심)").isTrue();
        executorService.shutdownNow();
        return List.copyOf(failures);
    }
}
