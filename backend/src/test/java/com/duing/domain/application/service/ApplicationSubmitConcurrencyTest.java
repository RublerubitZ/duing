package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

// @DirtiesContext 제거: 테스트가 1개뿐이고, IntegrationTestBase.cleanDatabase() 로 매 실행 전
// DB 상태를 초기화한다. 동시성 테스트는 별도 트랜잭션에서 동작하므로 @Transactional rollback 대신
// truncate 전략을 사용한다 (ApplicationStatusConcurrencyTest 와 동일 전제).
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationSubmitConcurrencyTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
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
    @DisplayName("같은 사용자가 동시에 두 번 제출하면 한 건만 저장되고 나머지는 중복 지원 안내를 받는다")
    void concurrentDuplicateSubmitKeepsSingleApplicationAndRejectsTheOther() throws Exception {
        Club club = saveActiveClub("동시제출동아리");
        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "동시제출모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        User applicant = saveUser("동시제출자");
        SubmitApplicationCommand submitCommand =
                new SubmitApplicationCommand(recruitment.getId(), applicant.getId(), List.of(), null);

        // existsBy 사전 체크만으로는 두 스레드가 모두 통과할 수 있는 경합 구간을 재현해야 하므로,
        // start 래치로 두 제출을 최대한 동시에 출발시킨다 (TransferLeaderConcurrencyTest 와 동일 패턴).
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger successCount = new AtomicInteger();
        AtomicInteger duplicateFailureCount = new AtomicInteger();
        AtomicInteger unexpectedFailureCount = new AtomicInteger();
        executor = Executors.newFixedThreadPool(2);

        Runnable submitTask = () -> {
            try {
                start.await();
                applicationService.submit(submitCommand);
                successCount.incrementAndGet();
            } catch (ApplicationDomainException.DuplicateApplicationException duplicateSubmission) {
                duplicateFailureCount.incrementAndGet();
            } catch (Exception unexpected) {
                unexpectedFailureCount.incrementAndGet();
            } finally {
                done.countDown();
            }
        };

        executor.submit(submitTask);
        executor.submit(submitTask);
        start.countDown();
        assertThat(done.await(15, TimeUnit.SECONDS)).as("동시성 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract: 정확히 한 건만 성공하고, 나머지 한 건은 순차 중복 제출과 동일한
        // DuplicateApplicationException("이미 지원한 모집 공고입니다.") 으로 실패해야 한다.
        // GlobalExceptionHandler 의 generic 409(handleDataIntegrityViolation) 로 새면 이 단언이 깨진다.
        assertThat(unexpectedFailureCount.get()).as("예상치 못한 예외는 없어야 한다").isEqualTo(0);
        assertThat(successCount.get()).as("정확히 한 건만 성공").isEqualTo(1);
        assertThat(duplicateFailureCount.get()).as("나머지 한 건은 중복 지원 예외").isEqualTo(1);
        assertThat(applicationRepository.countByRecruitmentId(recruitment.getId()))
                .as("DB 에는 application 1건만 존재").isEqualTo(1);
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "submitconc" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
