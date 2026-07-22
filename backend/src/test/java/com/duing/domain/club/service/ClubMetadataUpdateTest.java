package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
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
class ClubMetadataUpdateTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동아리 메타데이터(창설년도/기수/위치/활동)를 업데이트하면 ClubDetail 응답에 반영된다")
    void updateAndReadClubMetadata() throws Exception {
        User leader = saveUser("메타리더");
        Club club = saveActiveClub("메타동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Set<DayOfWeek> days = new LinkedHashSet<>(List.of(DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY));
        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, null, null, null, null, null, null,  // name~faqs
                2018,                                                  // foundedYear
                10,                                                    // cohortNumber
                "학생회관 405호",                                        // location
                2,                                                     // activityFrequency
                days,                                                  // activeDays
                null, null,                                            // tagline, highlights
                null, null, null, null,                                // contactVisibility, feeCycle, membershipFeeAmount, projects
                null, null, null, null                                 // college, clearCollege, clearLogoImage, clearCoverImage
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.foundedYear()).isEqualTo(2018);
        assertThat(detail.cohortNumber()).isEqualTo(10);
        assertThat(detail.location()).isEqualTo("학생회관 405호");
        assertThat(detail.activityFrequency()).isEqualTo(2);
        assertThat(detail.activeDays()).containsExactlyInAnyOrder(DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY);
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
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                com.duing.domain.club.entity.ClubCategory.OTHER, "분과", "설명", null);
        java.lang.reflect.Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, com.duing.domain.club.entity.ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
