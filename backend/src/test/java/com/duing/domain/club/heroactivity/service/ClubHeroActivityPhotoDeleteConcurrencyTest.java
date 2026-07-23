package com.duing.domain.club.heroactivity.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.heroactivity.exception.ClubHeroActivityException;
import com.duing.domain.club.heroactivity.repository.ClubHeroActivityRepository;
import com.duing.domain.club.heroactivity.service.dto.command.CreateHeroActivityCommand;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.domain.club.photo.exception.ClubPhotoException;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.photo.service.ClubPhotoService;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubHeroActivityPhotoDeleteConcurrencyTest extends IntegrationTestBase {

    @Autowired ClubHeroActivityService clubHeroActivityService;
    @Autowired ClubPhotoService clubPhotoService;
    @Autowired ClubHeroActivityRepository clubHeroActivityRepository;
    @Autowired ClubPhotoRepository clubPhotoRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
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
    @DisplayName("같은 사진에 대한 사진 삭제와 대표 활동 등록이 동시에 실행돼도 soft-delete 된 사진을 참조하는 대표 활동은 생기지 않는다")
    void photoDeleteVersusHeroCreateNeverLeavesHeroOnDeletedPhoto() throws Exception {
        User leader = saveUser("동시성리더");
        Club club = saveActiveClub("두잉히어로동시성");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubPhoto photo = savePhoto(club, "concurrent.jpg", 0);

        List<Throwable> failures = runConcurrently(
                () -> clubPhotoService.delete(club.getId(), leader.getId(), photo.getId()),
                () -> clubHeroActivityService.create(new CreateHeroActivityCommand(
                        club.getId(), leader.getId(), photo.getId(), "대표활동", "설명입니다", 1)));

        // 사진 행 PESSIMISTIC_WRITE 로 직렬화된다 — 삭제가 먼저 커밋되면 등록이 재평가에서 PhotoNotFound,
        // 등록이 먼저 커밋되면 삭제 가드가 ReferencedByHeroActivity. 어느 쪽이 이기든 정확히 한쪽만 실패한다.
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0)).isInstanceOfAny(
                ClubHeroActivityException.PhotoNotFound.class,
                ClubPhotoException.ReferencedByHeroActivity.class);

        // 불변식: 사진 생존 여부와 대표 활동 존재 여부가 일치해야 한다.
        // (사진 생존 && 대표 활동 존재)  또는  (사진 삭제 && 대표 활동 없음) 중 하나만 성립하고,
        // "soft-delete 된 사진을 참조하는 대표 활동" 은 절대 성립하지 않는다.
        boolean photoAlive = clubPhotoRepository.findByClubId(club.getId()).stream()
                .anyMatch(saved -> saved.getId().equals(photo.getId()));
        boolean heroExists = clubHeroActivityRepository.existsByClubPhotoId(photo.getId());
        assertThat(heroExists && !photoAlive)
                .as("soft-delete 된 사진을 참조하는 살아있는 대표 활동")
                .isFalse();
        assertThat(photoAlive).as("사진 생존과 대표 활동 존재는 항상 함께 성립한다").isEqualTo(heroExists);
    }

    // 두 작업을 latch 로 동시에 시작시키고, 각 스레드의 예외를 수집해 반환한다 (FederationFaqCategoryDeleteConcurrencyTest 전례).
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
        // 교착이 생기면 이 대기가 끝나지 않는다 — 사진 행 단일 잠금 규칙의 회귀 감시 지점.
        assertThat(done.await(10, TimeUnit.SECONDS)).as("두 트랜잭션이 교착 없이 완료").isTrue();
        return failures;
    }

    private ClubPhoto savePhoto(Club club, String storageKey, int displayOrder) {
        return clubPhotoRepository.save(
                ClubPhoto.create(club, storageKey, "캡션", 100, 100, displayOrder));
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
