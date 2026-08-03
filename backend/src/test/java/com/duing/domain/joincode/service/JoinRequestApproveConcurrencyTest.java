package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JoinRequestApproveConcurrencyTest extends IntegrationTestBase {

    @Autowired JoinRequestService joinRequestService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 같은 요청을 동시에 처리해도 환급과 상태 전이는 한 번만 반영된다")
    void concurrentDecideOnSameRequestAppliesOnce() throws Exception {
        Club club = saveActiveClub();
        User leader = saveLeaderOf(club);
        User officer = saveOfficerOf(club);
        ClubJoinCode joinCode = saveJoinCode(club, 10);
        User student = saveUser();
        ClubJoinRequest joinRequest = savePendingRequest(club, student, joinCode);

        List<Throwable> failures = runConcurrently(
                () -> tryDecide(club.getId(), joinRequest.getId(), leader.getId(), JoinRequestStatus.APPROVED),
                () -> tryDecide(club.getId(), joinRequest.getId(), officer.getId(), JoinRequestStatus.REJECTED));

        assertThat(failures).as("한쪽만 성공한다").hasSize(1);
        assertThat(failures.get(0))
                .as("뒤늦은 처리는 409 도메인 예외로만 표면화된다(제약 위반 500 누출 금지)")
                .isInstanceOfAny(JoinRequestException.AlreadyProcessedException.class,
                        JoinRequestException.ConcurrentDecisionException.class);

        JoinRequestStatus finalStatus = reloadStatus(joinRequest);
        assertThat(finalStatus).isIn(JoinRequestStatus.APPROVED, JoinRequestStatus.REJECTED);
        boolean approved = finalStatus == JoinRequestStatus.APPROVED;
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount())
                .as("승인이 이기면 신청 때 확보한 자리가 유지되고, 거절이 이기면 1회만 환급된다")
                .isEqualTo(approved ? 1 : 0);
        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), student.getId()).isPresent())
                .as("회원 생성도 승인이 이긴 경우에만").isEqualTo(approved);
    }

    private List<Throwable> runConcurrently(Callable<Throwable> firstTask, Callable<Throwable> secondTask)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(firstTask, secondTask));
        pool.shutdown();
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS))
                .as("동시 처리 테스트가 시간 내에 완료").isTrue();
        return outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();
    }

    private Throwable tryDecide(Long clubId, Long joinRequestId, Long requesterId, JoinRequestStatus status) {
        try {
            joinRequestService.decide(
                    new DecideJoinRequestCommand(clubId, joinRequestId, requesterId, status));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(15, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private JoinRequestStatus reloadStatus(ClubJoinRequest joinRequest) {
        return clubJoinRequestRepository.findById(joinRequest.getId()).orElseThrow().getStatus();
    }

    /** 신청 시점에 자리를 확보하는 실제 흐름(스펙 4.2)과 같은 상태로 대기 요청을 시드한다. */
    private ClubJoinRequest savePendingRequest(Club club, User student, ClubJoinCode joinCode) {
        ClubJoinCode stored = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        stored.tryConsume();
        clubJoinCodeRepository.save(stored);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, student, joinCode));
    }

    private ClubJoinCode saveJoinCode(Club club, int maxUses) {
        return clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, saveOpenExternalRecruitment(club), codeOf(sequence.getAndIncrement()), 12, maxUses,
                LocalDateTime.now().plusDays(30)));
    }

    /** code 는 전역 unique 이므로 시퀀스로 겹치지 않는 6자를 만든다. */
    private String codeOf(long seq) {
        String candidate = Long.toString(Math.abs(seq), 32).toUpperCase();
        return candidate.substring(candidate.length() - 6).replace('0', 'A').replace('1', 'B');
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private User saveLeaderOf(Club club) {
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return leader;
    }

    private User saveOfficerOf(Club club) {
        User officer = saveUser();
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        return officer;
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("동시승인동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    /** 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지). */
    private Recruitment saveOpenExternalRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
