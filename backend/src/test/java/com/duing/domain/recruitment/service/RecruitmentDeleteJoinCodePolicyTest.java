package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

/**
 * 모집 삭제의 단계적 가입 코드 정책(스펙 v2 4.2).
 *
 * <p>코드·요청 행은 물리 삭제하지 않으므로, 삭제 허용 여부와 함께 "무엇이 남는지"까지 단언한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RecruitmentDeleteJoinCodePolicyTest extends IntegrationTestBase {

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Club club;
    private User leader;
    private Recruitment recruitment;
    private ClubJoinCode joinCode;

    @BeforeEach
    void setUp() throws Exception {
        club = saveActiveClub();
        leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        recruitment = saveClosedExternalRecruitment();
        joinCode = clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, recruitment, "AB12CD", 12, 30, LocalDateTime.now().plusDays(30)));
    }

    @Test
    @DisplayName("가입 요청 없이 코드만 있는 모집은 삭제할 수 있고 활성 코드는 삭제와 함께 폐기된다")
    void deleteRevokesActiveJoinCodeWhenNoRequestsExist() {
        recruitmentService.delete(recruitment.getId(), leader.getId());

        assertThat(recruitmentRepository.findById(recruitment.getId()))
                .as("모집은 soft-delete 되어 조회되지 않는다").isEmpty();
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getRevokedAt())
                .as("고아 코드로 학생이 유입되지 않도록 삭제 트랜잭션이 코드를 폐기한다").isNotNull();
    }

    @Test
    @DisplayName("처리되지 않은 가입 요청이 남은 모집은 삭제할 수 없고 코드도 그대로 유지된다")
    void deleteIsBlockedWhilePendingJoinRequestExists() {
        ClubJoinRequest pending = savePendingRequest();

        assertThatThrownBy(() -> recruitmentService.delete(recruitment.getId(), leader.getId()))
                .isInstanceOf(RecruitmentException.PendingJoinRequestsExistException.class)
                .hasMessage("처리되지 않은 가입 요청이 있습니다. 먼저 승인하거나 거절해주세요.");

        assertThat(recruitmentRepository.findById(recruitment.getId()))
                .as("삭제가 막힌 모집은 그대로 남는다").isPresent();
        assertThat(clubJoinRequestRepository.findById(pending.getId()).orElseThrow().getStatus())
                .as("학생의 응답 대기 상태도 그대로다").isEqualTo(JoinRequestStatus.PENDING);
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getRevokedAt())
                .as("409 로 트랜잭션이 롤백되므로 코드 폐기도 되돌아간다").isNull();
    }

    @Test
    @DisplayName("처리 완료된 가입 요청 이력만 남은 모집은 삭제할 수 있고 이력 행은 보존된다")
    void deleteIsAllowedWhenOnlyProcessedRequestsRemain() {
        ClubJoinRequest approved = savePendingRequest();
        approved.approve(leader, LocalDateTime.now());
        clubJoinRequestRepository.save(approved);
        ClubJoinRequest rejected = savePendingRequest();
        rejected.reject(leader, LocalDateTime.now());
        clubJoinRequestRepository.save(rejected);

        recruitmentService.delete(recruitment.getId(), leader.getId());

        assertThat(recruitmentRepository.findById(recruitment.getId())).isEmpty();
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getRevokedAt())
                .as("완결된 이력만 남았으므로 삭제하되 코드는 폐기한다").isNotNull();
        assertThat(clubJoinRequestRepository.findById(approved.getId()))
                .as("승인 이력은 감사 증적으로 보존된다").isPresent();
        assertThat(clubJoinRequestRepository.findById(rejected.getId()))
                .as("거절 이력도 함께 보존된다").isPresent();
    }

    /** 실제 흐름과 같이 신청 시점에 코드 자리를 하나 확보한 PENDING 요청을 만든다(스펙 4.2). */
    private ClubJoinRequest savePendingRequest() {
        ClubJoinCode storedCode = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        storedCode.tryConsume();
        clubJoinCodeRepository.save(storedCode);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(
                club, userRepository.save(UserFixture.unique()), storedCode));
    }

    private Club saveActiveClub() throws Exception {
        Club created = Club.create("모집삭제동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    /** 삭제는 마감된 모집만 가능하므로 시드부터 마감 상태로 만든다. 기간은 오늘 기준 상대일. */
    private Recruitment saveClosedExternalRecruitment() {
        Recruitment created = Recruitment.createWithOptions(club,
                "외부 폼 모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(14), LocalDate.now().minusDays(1), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false);
        created.close();
        return recruitmentRepository.save(created);
    }
}
