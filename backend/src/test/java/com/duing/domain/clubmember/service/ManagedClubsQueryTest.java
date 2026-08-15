package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ManagedClubsQueryTest {

    @Autowired
    private ClubMemberRepository clubMemberRepository;
    @Autowired
    private ClubRepository clubRepository;
    @Autowired
    private RecruitmentRepository recruitmentRepository;
    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("LEADER 와 OFFICER 멤버십을 가진 두 동아리는 모두 운영 가능 목록에 포함된다")
    void leaderAndOfficerClubsAreReturned() throws Exception {
        User currentUser = saveStudent("운영자");
        Club leaderClub = saveActiveClub("리더동아리");
        Club officerClub = saveActiveClub("운영진동아리");
        saveMembership(leaderClub, currentUser, ClubMemberRole.LEADER);
        saveMembership(officerClub, currentUser, ClubMemberRole.OFFICER);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).hasSize(2);
        assertThat(result).extracting(ManagedClubQuery::clubId)
                .containsExactlyInAnyOrder(leaderClub.getId(), officerClub.getId());
        assertThat(result).extracting(ManagedClubQuery::myRole)
                .containsExactlyInAnyOrder(ClubMemberRole.LEADER, ClubMemberRole.OFFICER);
    }

    @Test
    @DisplayName("MEMBER 멤버십만 가진 동아리는 운영 가능 목록에서 제외된다")
    void memberOnlyClubIsExcluded() throws Exception {
        User currentUser = saveStudent("일반회원");
        Club memberClub = saveActiveClub("회원동아리");
        saveMembership(memberClub, currentUser, ClubMemberRole.MEMBER);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("ACTIVE 가 아닌 동아리는 운영 가능 목록에서 제외된다")
    void inactiveClubIsExcluded() throws Exception {
        User currentUser = saveStudent("승인대기리더");
        Club pendingClub = saveClubWithStatus("대기동아리", ClubStatus.PENDING_APPROVAL);
        saveMembership(pendingClub, currentUser, ClubMemberRole.LEADER);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("OPEN 이면서 종료일이 지나지 않은 모집만 activeRecruitmentCount 에 카운트된다 (상시모집 포함은 별도 검증)")
    void activeRecruitmentCountReflectsOpenAndDateRange() throws Exception {
        // uk_recruitment_club_active (V38) 로 동아리당 OPEN 모집은 1건만 허용되므로
        // 각 필터 차원(OPEN+future / OPEN+past / CLOSED+future) 을 동아리별로 분리해 검증한다.
        User currentUser = saveStudent("카운트리더");
        Club clubActive = saveActiveClub("카운트활성동아리");
        Club clubExpired = saveActiveClub("카운트만료동아리");
        Club clubClosed = saveActiveClub("카운트마감동아리");
        saveMembership(clubActive, currentUser, ClubMemberRole.LEADER);
        saveMembership(clubExpired, currentUser, ClubMemberRole.LEADER);
        saveMembership(clubClosed, currentUser, ClubMemberRole.LEADER);

        LocalDate today = LocalDate.now();
        saveRecruitment(clubActive, "진행중", today.minusDays(1), today.plusDays(5), RecruitmentStatus.OPEN);
        saveRecruitment(clubExpired, "기간만료", today.minusDays(20), today.minusDays(1), RecruitmentStatus.OPEN);
        saveRecruitment(clubClosed, "수동마감", today.minusDays(2), today.plusDays(5), RecruitmentStatus.CLOSED);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).hasSize(3);
        Map<Long, Long> countByClubId = result.stream()
                .collect(Collectors.toMap(ManagedClubQuery::clubId, ManagedClubQuery::activeRecruitmentCount));
        assertThat(countByClubId.get(clubActive.getId())).isEqualTo(1L);
        assertThat(countByClubId.get(clubExpired.getId())).isEqualTo(0L);
        assertThat(countByClubId.get(clubClosed.getId())).isEqualTo(0L);
    }

    @Test
    @DisplayName("상시모집(종료일 없음) 중인 동아리도 모집중 카운트에 포함된다")
    void alwaysOpenRecruitmentIsCountedAsActive() throws Exception {
        // 회귀 방지: endDate 가 NULL 인 상시모집은 SQL 3치 논리(goe 단독 비교) 에서
        // 카운트가 0 으로 떨어졌던 버그가 있었다 — Recruitment.isEffectivelyOpen 과 동치여야 한다.
        User currentUser = saveStudent("상시모집리더");
        Club alwaysOpenClub = saveActiveClub("상시모집동아리");
        saveMembership(alwaysOpenClub, currentUser, ClubMemberRole.LEADER);

        LocalDate today = LocalDate.now();
        saveRecruitment(alwaysOpenClub, "상시모집", today.minusDays(3), null, RecruitmentStatus.OPEN);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).activeRecruitmentCount()).isEqualTo(1L);
    }

    @Test
    @DisplayName("중앙동아리·일반동아리 모두 반환되며 centralClub 값은 각 동아리 플래그와 일치한다")
    void centralClubFlagMatchesEachClub() throws Exception {
        User currentUser = saveStudent("플래그리더");
        Club centralClub = saveActiveClub("중앙동아리");
        centralClub.changeCentralClub(true);
        Club generalClub = saveActiveClub("일반동아리");
        saveMembership(centralClub, currentUser, ClubMemberRole.LEADER);
        saveMembership(generalClub, currentUser, ClubMemberRole.LEADER);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).hasSize(2);
        Map<Long, Boolean> centralFlagByClubId = result.stream()
                .collect(Collectors.toMap(ManagedClubQuery::clubId, ManagedClubQuery::centralClub));
        assertThat(centralFlagByClubId.get(centralClub.getId())).isTrue();
        assertThat(centralFlagByClubId.get(generalClub.getId())).isFalse();
    }

    @Test
    @DisplayName("모집이 하나도 없는 동아리도 activeRecruitmentCount=0 으로 반환된다")
    void clubWithoutRecruitmentReturnsZeroCount() throws Exception {
        User currentUser = saveStudent("모집없는리더");
        Club club = saveActiveClub("모집없는동아리");
        saveMembership(club, currentUser, ClubMemberRole.LEADER);

        List<ManagedClubQuery> result = clubMemberRepository.findActiveManagedClubsByUser(currentUser.getId());

        assertThat(result).hasSize(1);
        assertThat(result.get(0).activeRecruitmentCount()).isEqualTo(0L);
        assertThat(result.get(0).myRole()).isEqualTo(ClubMemberRole.LEADER);
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        return saveClubWithStatus(name, ClubStatus.ACTIVE);
    }

    private Club saveClubWithStatus(String name, ClubStatus status) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        ClubMember membership = ClubMember.of(club, user, role);
        clubMemberRepository.save(membership);
    }

    private void saveRecruitment(Club club, String title, LocalDate start, LocalDate end, RecruitmentStatus status) throws Exception {
        Recruitment recruitment = Recruitment.create(club, title, null, start, end, 10);
        if (status != RecruitmentStatus.OPEN) {
            Field statusField = Recruitment.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(recruitment, status);
        }
        recruitmentRepository.save(recruitment);
    }
}