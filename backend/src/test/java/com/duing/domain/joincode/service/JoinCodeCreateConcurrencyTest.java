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
import com.duing.domain.joincode.exception.JoinCodeException;
import com.duing.domain.joincode.service.dto.command.CreateJoinCodeCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
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
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JoinCodeCreateConcurrencyTest extends IntegrationTestBase {

    @Autowired JoinCodeService joinCodeService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 같은 모집에 동시에 코드를 생성해도 활성 코드는 정확히 1개만 남는다")
    void concurrentCreateLeavesSingleActiveCode() throws Exception {
        User leader = userRepository.save(UserFixture.unique());
        User officer = userRepository.save(UserFixture.unique());
        Club club = saveActiveClub();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));
        Recruitment recruitment = saveExternalRecruitment(club);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> leaderTask = () -> tryCreate(club.getId(), recruitment.getId(), leader.getId());
        Callable<Throwable> officerTask = () -> tryCreate(club.getId(), recruitment.getId(), officer.getId());

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(leaderTask, officerTask));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 생성 테스트가 시간 내에 완료").isTrue();

        List<Throwable> failures = outcomes.stream().map(this::quietGet).filter(java.util.Objects::nonNull).toList();

        // 핵심 contract 1: 최소 한쪽은 성공한다(둘 다 거부되면 운영진이 코드를 못 만든다).
        assertThat(failures).as("두 요청이 모두 실패해서는 안 된다").hasSizeLessThan(2);
        // 핵심 contract 2: 실패는 재시도 가능한 409 로만 표면화된다(500 누출 금지).
        assertThat(failures).allSatisfy(failure -> assertThat(failure)
                .isInstanceOf(JoinCodeException.ConcurrentJoinCodeOperationException.class));
        // 핵심 contract 3: partial unique 가 모집당 다중 활성 코드를 구조적으로 막는다.
        Integer activeCodeCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_join_code "
                        + "WHERE recruitment_id = ? AND revoked_at IS NULL AND deleted_at IS NULL",
                Integer.class, recruitment.getId());
        assertThat(activeCodeCount).as("활성 코드는 정확히 1개").isEqualTo(1);
    }

    private Throwable tryCreate(Long clubId, Long recruitmentId, Long requesterId) {
        try {
            joinCodeService.create(new CreateJoinCodeCommand(clubId, recruitmentId, requesterId, 30, 30, 1));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("동시생성동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveExternalRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집", "내용", LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
