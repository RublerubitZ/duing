package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class RecruitmentReplaceActiveTest {

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("active 모집이 이미 존재하면 일반 create 호출은 DuplicateActiveRecruitmentException 을 던진다")
    void createRejectsWhenActiveExists() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("두잉");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        recruitmentService.create(buildExternalCommand(club, leader, "기존active"));

        assertThatThrownBy(() -> recruitmentService.create(buildExternalCommand(club, leader, "새active")))
                .isInstanceOf(RecruitmentException.DuplicateActiveRecruitmentException.class);
    }

    @Test
    @DisplayName("replaceActive 호출 시 기존 active 는 CLOSED 로 마감되고 새 모집이 OPEN 으로 생성된다")
    void replaceActiveClosesExistingAndCreatesNew() throws Exception {
        User leader = saveUser("리더교체");
        Club club = saveActiveClub("교체동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long oldId = recruitmentService.create(buildExternalCommand(club, leader, "기존active"));
        Long newId = recruitmentService.replaceActive(buildExternalCommand(club, leader, "신규active"));

        Recruitment oldRecruitment = recruitmentRepository.findById(oldId).orElseThrow();
        Recruitment newRecruitment = recruitmentRepository.findById(newId).orElseThrow();
        assertThat(oldRecruitment.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(newRecruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(oldId).isNotEqualTo(newId);
    }

    @Test
    @DisplayName("replaceActive 는 active 가 없을 때도 정상적으로 새 모집을 생성한다")
    void replaceActiveCreatesWhenNoActive() throws Exception {
        User leader = saveUser("리더없음");
        Club club = saveActiveClub("초기동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long newId = recruitmentService.replaceActive(buildExternalCommand(club, leader, "신규active"));

        Recruitment recruitment = recruitmentRepository.findById(newId).orElseThrow();
        assertThat(recruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
    }

    private CreateRecruitmentCommand buildExternalCommand(Club club, User leader, String title) {
        return new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                title,
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.EXTERNAL,
                "https://example.com/form",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
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
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
