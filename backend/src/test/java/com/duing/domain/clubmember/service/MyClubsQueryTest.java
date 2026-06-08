package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class MyClubsQueryTest {

    @Autowired
    private ClubMemberRepository clubMemberRepository;
    @Autowired
    private ClubRepository clubRepository;
    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER / OFFICER / MEMBER 멤버십이 모두 반환된다")
    void allRoleMembershipsAreReturned() throws Exception {
        User currentUser = saveStudent("소속회원");
        Club leaderClub = saveActiveClub("리더동아리");
        Club officerClub = saveActiveClub("운영진동아리");
        Club memberClub = saveActiveClub("일반동아리");
        saveMembership(leaderClub, currentUser, ClubMemberRole.LEADER);
        saveMembership(officerClub, currentUser, ClubMemberRole.OFFICER);
        saveMembership(memberClub, currentUser, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).hasSize(3);
        assertThat(result).extracting(MyClubQuery::myRole)
                .containsExactlyInAnyOrder(
                        ClubMemberRole.LEADER,
                        ClubMemberRole.OFFICER,
                        ClubMemberRole.MEMBER
                );
    }

    @Test
    @DisplayName("다른 사용자의 멤버십은 반환되지 않는다")
    void otherUsersMembershipsAreExcluded() throws Exception {
        User currentUser = saveStudent("본인");
        User otherUser = saveStudent("타인");
        Club club = saveActiveClub("타인동아리");
        saveMembership(club, otherUser, ClubMemberRole.LEADER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("최근 가입(joinedAt DESC) 순으로 정렬된다")
    void resultsAreOrderedByJoinedAtDesc() throws Exception {
        User currentUser = saveStudent("순서검증");
        Club firstClub = saveActiveClub("먼저가입");
        Club secondClub = saveActiveClub("나중가입");

        saveMembership(firstClub, currentUser, ClubMemberRole.MEMBER);
        Thread.sleep(50);
        saveMembership(secondClub, currentUser, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).hasSize(2);
        assertThat(result).extracting(MyClubQuery::clubId)
                .containsExactly(secondClub.getId(), firstClub.getId());
    }

    @Test
    @DisplayName("joinedAt 필드가 null 이 아니다")
    void joinedAtIsPopulated() throws Exception {
        User currentUser = saveStudent("가입일검증");
        Club club = saveActiveClub("가입일동아리");
        LocalDateTime before = LocalDateTime.now().minusSeconds(1);

        saveMembership(club, currentUser, ClubMemberRole.MEMBER);

        List<MyClubQuery> result = clubMemberRepository.findMyClubsByUser(currentUser.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).joinedAt()).isNotNull();
        assertThat(result.get(0).joinedAt()).isAfter(before);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "user" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        ClubMember membership = ClubMember.of(club, user, role);
        clubMemberRepository.saveAndFlush(membership);
    }
}
