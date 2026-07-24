package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubViewer;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
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
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubDetailActiveRecruitmentTest {

    @Autowired ClubService clubService;
    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("active 모집이 없으면 ClubDetail.activeRecruitment 는 null 이다")
    void noActiveRecruitmentReturnsNull() throws Exception {
        User leader = saveUser("리더무");
        Club club = saveActiveClub("무동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        ClubDetailQuery detail = clubService.getById(club.getId(), ClubViewer.anonymous());
        assertThat(detail.activeRecruitment()).isNull();
    }

    @Test
    @DisplayName("active 모집이 있으면 ClubDetail.activeRecruitment 에 학생 카드 정보가 채워진다")
    void activeRecruitmentReturnedAsProjection() throws Exception {
        User leader = saveUser("리더유");
        Club club = saveActiveClub("유동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(), leader.getId(), "공개모집", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://example.com/form", false,
                TargetRole.MEMBER, List.of(), null, null, false
        ));

        ClubDetailQuery detail = clubService.getById(club.getId(), ClubViewer.anonymous());
        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().id()).isEqualTo(recruitmentId);
        assertThat(detail.activeRecruitment().displayStatus()).isEqualTo(RecruitmentDisplayStatus.OPEN);
        assertThat(detail.activeRecruitment().applicantCount()).isNull();
    }

    @Test
    @DisplayName("showApplicantCount=true 인 active 모집은 applicantCount 가 실제 지원자 수로 채워진다")
    void applicantCountIsReturnedWhenShowFlagOn() throws Exception {
        User leader = saveUser("리더공개");
        Club club = saveActiveClub("공개동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Long recruitmentId = recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(), leader.getId(), "공개카운트", null,
                LocalDate.now(), LocalDate.now().plusDays(7), 10,
                ApplicationMode.SELF, null, false,
                TargetRole.MEMBER, List.of(RecruitmentQuestion.createText("자기소개")), null, null, true
        ));
        Recruitment recruitment = recruitmentRepository.findById(recruitmentId).orElseThrow();
        User applicant = saveUser("지원자");
        applicationRepository.save(Application.submit(recruitment, applicant,
                List.of(new ApplicationAnswer("q1", List.of("안녕")))));

        ClubDetailQuery detail = clubService.getById(club.getId(), ClubViewer.anonymous());
        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().applicantCount()).isEqualTo(1);
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
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
