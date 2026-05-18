package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class ClubMemberQueryServiceTest {

    @Autowired ClubMemberQueryService clubMemberQueryService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER 가 호출하면 LEADER→OFFICER→MEMBER 순, 그룹 내 가입일 오름차순으로 반환된다")
    void leaderGetsOrderedList() throws Exception {
        User leader = saveUser("리더1");
        User officerA = saveUser("운영A");
        User officerB = saveUser("운영B");
        User memberA = saveUser("일반A");
        User memberB = saveUser("일반B");
        Club club = saveActiveClub("두잉멤버1");
        // 저장 순서대로 createdAt 이 오름차순으로 부여된다 (BaseEntity @CreatedDate)
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officerA, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.of(club, officerB, ClubMemberRole.OFFICER));
        clubMemberRepository.save(ClubMember.asMember(club, memberA));
        clubMemberRepository.save(ClubMember.asMember(club, memberB));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name)
                .containsExactly("리더1", "운영A", "운영B", "일반A", "일반B");
        assertThat(result).extracting(ClubMemberQuery::role)
                .containsExactly(
                        ClubMemberRole.LEADER,
                        ClubMemberRole.OFFICER, ClubMemberRole.OFFICER,
                        ClubMemberRole.MEMBER, ClubMemberRole.MEMBER);
    }

    @Test
    @DisplayName("OFFICER 도 멤버 목록을 조회할 수 있다")
    void officerCanGetList() throws Exception {
        User leader = saveUser("리더2");
        User officer = saveUser("운영2");
        Club club = saveActiveClub("두잉멤버2");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, officer, ClubMemberRole.OFFICER));

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), officer.getId());

        assertThat(result).hasSize(2);
    }

    @Test
    @DisplayName("MEMBER 가 호출하면 AccessDenied 가 발생한다")
    void memberIsRejected() throws Exception {
        User memberUser = saveUser("일반멤버");
        Club club = saveActiveClub("두잉멤버3");
        clubMemberRepository.save(ClubMember.asMember(club, memberUser));

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), memberUser.getId()))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("비멤버가 호출하면 NotAMember 가 발생한다")
    void nonMemberIsRejected() throws Exception {
        User stranger = saveUser("외부인");
        Club club = saveActiveClub("두잉멤버4");

        assertThatThrownBy(() -> clubMemberQueryService.getMembers(club.getId(), stranger.getId()))
                .isInstanceOf(ClubMemberException.NotAMember.class);
    }

    @Test
    @DisplayName("soft-delete 된 멤버는 결과에 포함되지 않는다")
    void softDeletedExcluded() throws Exception {
        User leader = saveUser("리더5");
        User leftMember = saveUser("탈퇴자");
        Club club = saveActiveClub("두잉멤버5");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember leftMembership = clubMemberRepository.save(ClubMember.asMember(club, leftMember));

        clubMemberRepository.delete(leftMembership);

        List<ClubMemberQuery> result = clubMemberQueryService.getMembers(club.getId(), leader.getId());

        assertThat(result).extracting(ClubMemberQuery::name).containsExactly("리더5");
    }

    private User saveUser(String name) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "u" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }
}
