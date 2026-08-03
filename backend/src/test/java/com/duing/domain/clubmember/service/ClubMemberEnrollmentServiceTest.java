package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 회원 등록 공통 서비스의 upgrade-or-insert 계약을 검증한다.
 * enroll 은 {@code Propagation.MANDATORY} 라 호출측 트랜잭션이 필수이므로 TransactionTemplate 으로 감싼다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubMemberEnrollmentServiceTest extends IntegrationTestBase {

    @Autowired ClubMemberEnrollmentService clubMemberEnrollmentService;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;

    @Test
    @DisplayName("멤버십이 없는 사용자를 등록하면 기수가 함께 저장된다")
    void enrollNewMemberWithGeneration() {
        Club club = clubRepository.save(ClubFixture.academic("신규가입동아리"));
        User student = userRepository.save(UserFixture.unique());

        transactionTemplate.executeWithoutResult(txStatus ->
                clubMemberEnrollmentService.enroll(club, student, ClubMemberRole.MEMBER, 26));

        ClubMember saved = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), student.getId()).orElseThrow();
        assertThat(saved.getRole()).isEqualTo(ClubMemberRole.MEMBER);
        assertThat(saved.getGeneration()).isEqualTo(26);
    }

    @Test
    @DisplayName("이미 상위 역할인 멤버를 등록해도 강등되지 않고 기존 기수가 유지된다")
    void enrollExistingOfficerKeepsRoleAndGeneration() {
        Club club = clubRepository.save(ClubFixture.academic("운영진보유동아리"));
        User officer = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER, 25));

        transactionTemplate.executeWithoutResult(txStatus ->
                clubMemberEnrollmentService.enroll(club, officer, ClubMemberRole.MEMBER, 26));

        ClubMember existingMembership = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), officer.getId()).orElseThrow();
        assertThat(existingMembership.getRole()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(existingMembership.getGeneration()).isEqualTo(25);
    }

    @Test
    @DisplayName("하위 역할 멤버를 상위 역할로 등록하면 같은 행이 승급되고 새 행은 생기지 않는다")
    void enrollExistingMemberUpgradesRoleInPlace() {
        Club club = clubRepository.save(ClubFixture.academic("승급동아리"));
        User member = userRepository.save(UserFixture.unique());
        ClubMember beforeUpgrade =
                clubMemberRepository.save(ClubMember.of(club, member, ClubMemberRole.MEMBER, 25));

        transactionTemplate.executeWithoutResult(txStatus ->
                clubMemberEnrollmentService.enroll(club, member, ClubMemberRole.OFFICER, 26));

        ClubMember afterUpgrade = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), member.getId()).orElseThrow();
        assertThat(afterUpgrade.getId()).isEqualTo(beforeUpgrade.getId());
        assertThat(afterUpgrade.getRole()).isEqualTo(ClubMemberRole.OFFICER);
        assertThat(afterUpgrade.getGeneration()).isEqualTo(25);
    }

    @Test
    @DisplayName("탈퇴한 멤버를 다시 등록하면 새 멤버십 행이 생성된다")
    void enrollAfterWithdrawalInsertsNewRow() {
        Club club = clubRepository.save(ClubFixture.academic("재가입동아리"));
        User rejoiner = userRepository.save(UserFixture.unique());
        ClubMember withdrawnMembership =
                clubMemberRepository.save(ClubMember.of(club, rejoiner, ClubMemberRole.MEMBER, 24));
        clubMemberRepository.delete(withdrawnMembership);

        transactionTemplate.executeWithoutResult(txStatus ->
                clubMemberEnrollmentService.enroll(club, rejoiner, ClubMemberRole.MEMBER, 26));

        ClubMember rejoinedMembership = clubMemberRepository
                .findByClubIdAndUserId(club.getId(), rejoiner.getId()).orElseThrow();
        assertThat(rejoinedMembership.getId()).isNotEqualTo(withdrawnMembership.getId());
        assertThat(rejoinedMembership.getGeneration()).isEqualTo(26);
    }
}
