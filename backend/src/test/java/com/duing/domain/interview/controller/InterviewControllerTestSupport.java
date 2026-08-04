package com.duing.domain.interview.controller;

import com.duing.common.IntegrationTestBase;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 면접 컨트롤러 통합 테스트 공통 헬퍼.
 * <p>
 * 헬퍼가 repository 저장까지 수행하므로 {@code common/fixture} 의 static 패턴으로는 옮길 수 없어
 * 도메인-로컬 base class 로 공통화한다 (BE#2~3 에서 3중 복사된 헬퍼의 단일화).
 * 셋업(@BeforeEach)은 테스트마다 다르므로 각 테스트가 유지한다.
 */
public abstract class InterviewControllerTestSupport extends IntegrationTestBase {

    @Autowired protected UserRepository userRepository;
    @Autowired protected ClubRepository clubRepository;
    @Autowired protected ClubMemberRepository clubMemberRepository;
    @Autowired protected RecruitmentRepository recruitmentRepository;
    @Autowired protected ApplicationRepository applicationRepository;
    @Autowired protected InterviewRoundRepository interviewRoundRepository;
    @Autowired protected InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired protected JwtTokenProvider jwtTokenProvider;

    protected final AtomicLong sequence = new AtomicLong(System.nanoTime());

    protected User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    protected Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    protected Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false));
    }

    protected Recruitment saveSimpleRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10));
    }

    protected Application saveSubmittedApplication(Recruitment recruitment, String applicantSuffix) {
        User applicant = saveUser(applicantSuffix);
        return applicationRepository.save(Application.submit(recruitment, applicant, List.of()));
    }

    protected Application saveOnHoldApplication(Recruitment recruitment, String applicantSuffix) {
        Application application = saveSubmittedApplication(recruitment, applicantSuffix);
        application.transitionTo(ApplicationStatus.ON_HOLD, true);
        return applicationRepository.save(application);
    }

    protected Application saveInterviewPendingApplication(Recruitment recruitment, String applicantSuffix) {
        Application application = saveSubmittedApplication(recruitment, applicantSuffix);
        application.transitionTo(ApplicationStatus.INTERVIEW_PENDING, true);
        return applicationRepository.save(application);
    }

    protected Application saveApplicationWithStatus(Recruitment recruitment, String applicantSuffix,
                                                    ApplicationStatus status) {
        Application application = saveSubmittedApplication(recruitment, applicantSuffix);
        if (status != ApplicationStatus.SUBMITTED) {
            // 전이 규칙을 우회하는 셋업 한정 리플렉션 (saveActiveClub 의 ClubStatus 전례).
            ReflectionTestUtils.setField(application, "status", status);
            application = applicationRepository.save(application);
        }
        return application;
    }
}
