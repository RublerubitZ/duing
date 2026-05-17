package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TransferLeaderConcurrencyTest {

    @Autowired ClubMemberCommandService clubMemberCommandService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
        // 본 테스트는 비-@Transactional 이라 직접 정리. 다른 테스트가 남긴 recruitment 등의
        // FK 참조를 깨지 않기 위해 이 테스트가 만든 club_member 만 우선 정리한다.
        clubMemberRepository.deleteAllInBatch();
    }

    @Test
    @DisplayName("동일 LEADER 가 두 스레드에서 서로 다른 대상에 동시 인계해도 LEADER 는 정확히 1명만 남는다")
    void concurrentTransfersResultInSingleLeader() throws Exception {
        User leader = saveUser("리더CC");
        User candidateA = saveUser("후보A");
        User candidateB = saveUser("후보B");
        Club club = saveActiveClub("두잉동시인계");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember a = clubMemberRepository.save(ClubMember.of(club, candidateA, ClubMemberRole.OFFICER));
        ClubMember b = clubMemberRepository.save(ClubMember.of(club, candidateB, ClubMemberRole.OFFICER));

        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        AtomicInteger success = new AtomicInteger();
        AtomicInteger failure = new AtomicInteger();
        executor = Executors.newFixedThreadPool(2);

        Runnable task1 = () -> awaitAndTransfer(start, done, success, failure,
                new TransferLeaderCommand(club.getId(), a.getId(), leader.getId()));
        Runnable task2 = () -> awaitAndTransfer(start, done, success, failure,
                new TransferLeaderCommand(club.getId(), b.getId(), leader.getId()));

        executor.submit(task1);
        executor.submit(task2);
        start.countDown();
        assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();

        long leaderCount = clubMemberRepository.findAll().stream()
                .filter(membership -> membership.getClub().getId().equals(club.getId()))
                .filter(membership -> membership.getRole() == ClubMemberRole.LEADER)
                .count();
        assertThat(leaderCount).isEqualTo(1L);
        // 둘 다 성공하거나(첫 인계 후 두번째도 새 LEADER 권한 없는 호출자라 거부) 하나만 성공.
        // 본 테스트의 핵심 불변식은 "LEADER 가 정확히 1명". 성공/실패 분포는 환경에 따라 다를 수 있으므로 단언하지 않는다.
        assertThat(success.get() + failure.get()).isEqualTo(2);
    }

    private void awaitAndTransfer(CountDownLatch start, CountDownLatch done,
                                  AtomicInteger success, AtomicInteger failure,
                                  TransferLeaderCommand command) {
        try {
            start.await();
            clubMemberCommandService.transferLeader(command);
            success.incrementAndGet();
        } catch (Exception e) {
            failure.incrementAndGet();
        } finally {
            done.countDown();
        }
    }

    private User saveUser(String name) {
        long unique = System.nanoTime();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + System.nanoTime();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
