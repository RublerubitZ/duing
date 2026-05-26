package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
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
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
class ClubNarrativeUpdateTest {

    @Autowired ClubService clubService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("tagline/highlights/majorProjects 를 업데이트하면 ClubDetail 응답에 그대로 반영된다")
    void updateAndReadNarrativeContent() throws Exception {
        User leader = saveUser("서술리더");
        Club club = saveActiveClub("서술동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                "코드를 두잉",
                List.of("개발 기초 다진 사람", "사이드 프로젝트 동료 필요한 사람"),
                "올해는 이번 학기 박람회 부스 안내 앱을 만들고 있어요.",
                null, null
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.tagline()).isEqualTo("코드를 두잉");
        assertThat(detail.highlights())
                .containsExactly("개발 기초 다진 사람", "사이드 프로젝트 동료 필요한 사람");
        assertThat(detail.majorProjects())
                .isEqualTo("올해는 이번 학기 박람회 부스 안내 앱을 만들고 있어요.");
    }

    @Test
    @DisplayName("highlights 를 빈 리스트로 업데이트하면 응답에서도 빈 리스트가 반환된다")
    void updateEmptyHighlights() throws Exception {
        User leader = saveUser("빈리스트리더");
        Club club = saveActiveClub("빈리스트동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.update(new UpdateClubCommand(
                club.getId(), leader.getId(),
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, List.of(), null,
                null, null
        ));

        ClubDetailQuery detail = clubService.getById(club.getId());
        assertThat(detail.highlights()).isEmpty();
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
                LocalDateTime.now()
        ));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                com.duing.domain.club.entity.ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, com.duing.domain.club.entity.ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
