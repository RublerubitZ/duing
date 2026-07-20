package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.repository.FacilityBookingRepository;
import com.duing.domain.facilitysubmission.entity.FacilitySubmissionBatch;
import com.duing.domain.facilitysubmission.exception.FacilitySubmissionException;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionBatchRepository;
import com.duing.domain.facilitysubmission.repository.FacilitySubmissionItemRepository;
import com.duing.domain.facilitysubmission.service.dto.command.CreateSubmissionBatchCommand;
import com.duing.domain.facilitysubmission.service.dto.command.SubmissionActorContext;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilitySubmissionConcurrencyTest extends IntegrationTestBase {

    @Autowired FacilitySubmissionService submissionService;
    @Autowired FacilitySubmissionBatchRepository batchRepository;
    @Autowired FacilitySubmissionItemRepository itemRepository;
    @Autowired FacilityBookingRepository bookingRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired FacilityRepository facilityRepository;

    @Test
    @DisplayName("같은 예약으로 동시에 Batch 2개를 만들면 정확히 하나만 성공한다")
    void concurrentCreatesForSameBookingAllowExactlyOne() throws InterruptedException {
        User admin = userRepository.save(UserFixture.admin());
        User applicant = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(Club.create("동시성동아리", ClubCategory.OTHER, "분과", "설명", null));
        Facility facility = facilityRepository.save(Facility.create(91000, "커뮤니티룸(1)", "1503호", 0));
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        Long bookingId = bookingRepository.save(booking).getId();
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");

        List<Throwable> failures = runConcurrently(2, () -> submissionService.create(
                new CreateSubmissionBatchCommand(List.of(bookingId), null), actor));

        assertThat(failures).as("행잠금 직렬화로 정확히 한쪽만 거부돼야 한다").hasSize(1);
        assertThat(failures.get(0))
                .isInstanceOf(FacilitySubmissionException.AlreadySubmittedBookingException.class);
        assertThat(batchRepository.count()).isEqualTo(1);
        assertThat(itemRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 Batch 의 완료와 취소가 동시에 실행되면 행잠금으로 정확히 한쪽만 성공한다")
    void concurrentCompleteAndCancelAllowExactlyOne() throws InterruptedException {
        User admin = userRepository.save(UserFixture.admin());
        User applicant = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(Club.create("완료동시성", ClubCategory.OTHER, "분과", "설명", null));
        Facility facility = facilityRepository.save(Facility.create(91001, "커뮤니티룸(2)", "1504호", 0));
        FacilityBooking booking = FacilityBooking.request(
                facility.getId(), club.getId(), applicant.getId(), LocalDate.now().plusDays(7),
                LocalTime.of(9, 0), LocalTime.of(10, 0), "정기 합주", 20,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(admin.getId(), null, LocalDateTime.now());
        Long bookingId = bookingRepository.save(booking).getId();
        SubmissionActorContext actor = new SubmissionActorContext(admin.getId(), "127.0.0.1", "JUnit");
        Long batchId = submissionService.create(
                new CreateSubmissionBatchCommand(List.of(bookingId), null), actor).batchId();

        AtomicInteger turn = new AtomicInteger();
        List<Throwable> failures = runConcurrently(2, () -> {
            if (turn.getAndIncrement() == 0) submissionService.complete(batchId, actor);
            else submissionService.cancel(batchId, actor);
        });

        assertThat(failures).as("행잠금 직렬화로 정확히 한쪽만 거부돼야 한다").hasSize(1);
        assertThat(failures.get(0)).isInstanceOfAny(
                FacilitySubmissionException.BatchAlreadyCancelledException.class,
                FacilitySubmissionException.CompletedBatchUncancellableException.class);
        FacilitySubmissionBatch batch = batchRepository.findById(batchId).orElseThrow();
        assertThat(batch.isCompleted() ^ batch.isCancelled())
                .as("완료·취소는 상호 배타 — 정확히 하나만 참").isTrue();
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
