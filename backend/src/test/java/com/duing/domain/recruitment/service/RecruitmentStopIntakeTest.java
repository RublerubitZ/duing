package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * 상시모집 접수 마감(#888) 통합 검증 — 실제 seoulClock 빈·리포지토리로 KST 어제 확정과
 * "접수 마감 → 새 모집 생성" 흐름(create 의 만료-OPEN 자동 마감 조건 endDate.isBefore(today) 정합성)을 고정한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class RecruitmentStopIntakeTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Autowired
    private RecruitmentService recruitmentService;
    @Autowired
    private RecruitmentRepository recruitmentRepository;
    @Autowired
    private ClubRepository clubRepository;
    @Autowired
    private ClubMemberRepository clubMemberRepository;
    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("상시모집 접수를 마감하면 종료일이 KST 어제로 확정되고 OPEN 상태로 표시만 마감된다")
    void stopIntakeFixesEndDateToYesterdayAndDisplayStatusBecomesClosed() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("상시동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);
        Long recruitmentId = recruitmentService.create(
                alwaysOpenCommand(club.getId(), leader.getId(), LocalDate.now(KST).minusDays(10)));

        recruitmentService.stopIntake(recruitmentId, leader.getId());

        LocalDate kstToday = LocalDate.now(KST);
        Recruitment stoppedRecruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        assertThat(stoppedRecruitment.getEndDate()).isEqualTo(kstToday.minusDays(1));
        assertThat(stoppedRecruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
        assertThat(stoppedRecruitment.getClosedAt()).isNull();
        assertThat(stoppedRecruitment.isEffectivelyOpen(kstToday)).isFalse();
        assertThat(recruitmentService.getById(recruitmentId).displayStatus())
                .isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }

    @Test
    @DisplayName("접수 마감된 모집이 있어도 새 모집을 생성할 수 있고 기존 모집은 자동으로 마감된다")
    void creatingNewRecruitmentAfterStopIntakeAutoClosesStoppedOne() throws Exception {
        User leader = saveUser("리더");
        Club club = saveActiveClub("상시동아리");
        saveMembership(club, leader, ClubMemberRole.LEADER);
        Long stoppedRecruitmentId = recruitmentService.create(
                alwaysOpenCommand(club.getId(), leader.getId(), LocalDate.now(KST).minusDays(10)));
        recruitmentService.stopIntake(stoppedRecruitmentId, leader.getId());

        Long newRecruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                "다음 기수 모집",
                "내용",
                LocalDate.now(KST),
                LocalDate.now(KST).plusDays(14),
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                null,
                null,
                false
        ));

        Recruitment stoppedRecruitment = recruitmentRepository.findById(stoppedRecruitmentId).orElseThrow();
        assertThat(stoppedRecruitment.getStatus()).isEqualTo(RecruitmentStatus.CLOSED);
        assertThat(stoppedRecruitment.getClosedAt())
                .as("자동 마감도 close() 경로라 종료 시각이 스탬프된다").isNotNull();
        Recruitment newRecruitment = recruitmentRepository.findById(newRecruitmentId).orElseThrow();
        assertThat(newRecruitment.getStatus()).isEqualTo(RecruitmentStatus.OPEN);
    }

    private CreateRecruitmentCommand alwaysOpenCommand(Long clubId, Long leaderId, LocalDate startDate) {
        return new CreateRecruitmentCommand(
                clubId,
                leaderId,
                "상시 모집",
                "내용",
                startDate,
                null,
                10,
                ApplicationMode.SELF,
                null,
                false,
                TargetRole.MEMBER,
                List.of(RecruitmentQuestion.createText("자기소개")),
                null,
                null,
                false
        );
    }

    private User saveUser(String name) {
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
        Club club = Club.create(name + "-" + sequence.getAndIncrement(), ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void saveMembership(Club club, User user, ClubMemberRole role) {
        clubMemberRepository.save(ClubMember.of(club, user, role));
    }
}
