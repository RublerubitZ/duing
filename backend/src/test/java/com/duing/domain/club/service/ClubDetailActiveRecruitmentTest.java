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
import com.duing.domain.recruitment.repository.ClubActiveRecruitmentRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.Clock;
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
    /** "오늘" 판정은 프로덕션과 같은 seoulClock 으로 — 시스템 존(UTC CI)으로 찍으면 자정 부근에 하루 어긋난다. */
    @Autowired Clock clock;

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
                ApplicationMode.EXTERNAL, "https://forms.gle/aBcD1234", false,
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

    @Test
    @DisplayName("진행 중인 모집이 없으면 상세는 목록 카드와 같은 마감 모집을 내려준다")
    void closedRecruitmentIsSharedWithListCard() throws Exception {
        User leader = saveUser("리더마감");
        Club club = saveActiveClub("마감동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        // 마감 모집을 여러 건 두어야 "같은 행"이 정렬 규칙 덕분인지 우연인지 갈린다 — 1건이면 어떤
        // 규칙을 써도 통과한다. 마감된 상시모집(endDate 없음)까지 섞어 센티널 자리도 함께 고정한다.
        saveClosedRecruitment(club, "재작년모집", LocalDate.now(clock).minusDays(400),
                LocalDate.now(clock).minusDays(380));
        saveClosedRecruitment(club, "지난상시모집", LocalDate.now(clock).minusDays(200), null);
        Long latestClosedId = saveClosedRecruitment(club, "지난모집",
                LocalDate.now(clock).minusDays(30), LocalDate.now(clock).minusDays(3)).getId();

        ClubDetailQuery detail = clubService.getById(club.getId(), ClubViewer.anonymous());

        // 목록 카드가 "모집마감" 칩을 띄우는 근거와 같은 모집이어야 한다 — 규칙이 갈리면 목록은 마감,
        // 상세는 "현재 모집 없음"으로 한 동아리가 두 답을 한다.
        ClubActiveRecruitmentRow listCardRow = recruitmentRepository
                .findRepresentativeByClubIds(List.of(club.getId()), LocalDate.now(clock))
                .get(club.getId());
        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().id()).isEqualTo(listCardRow.recruitmentId());
        assertThat(detail.activeRecruitment().displayStatus()).isEqualTo(RecruitmentDisplayStatus.CLOSED);
        assertThat(detail.activeRecruitment().id())
                .as("마감 모집 중에서는 가장 최근에 끝난 것을 고른다 — 마감된 상시모집이 자리를 가로채지 않는다")
                .isEqualTo(latestClosedId);
    }

    @Test
    @DisplayName("마감 이력이 있어도 진행 중인 모집이 있으면 상세는 진행 중인 모집을 내려준다")
    void openRecruitmentWinsOverClosedHistory() throws Exception {
        User leader = saveUser("리더진행");
        Club club = saveActiveClub("진행동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        saveClosedRecruitment(club, "지난모집", LocalDate.now(clock).minusDays(30),
                LocalDate.now(clock).minusDays(3));
        Long openRecruitmentId = createRecruitment(club, leader, "이번모집");

        ClubDetailQuery detail = clubService.getById(club.getId(), ClubViewer.anonymous());

        assertThat(detail.activeRecruitment()).isNotNull();
        assertThat(detail.activeRecruitment().id()).isEqualTo(openRecruitmentId);
        assertThat(detail.activeRecruitment().displayStatus()).isEqualTo(RecruitmentDisplayStatus.OPEN);
    }

    /**
     * 모집 기간은 하드코딩 절대일자 없이 오늘 기준 상대일로 만든다(시한폭탄 테스트 방지).
     * "오늘"은 프로덕션과 같은 seoulClock 을 쓴다 — 시스템 존과 섞으면 자정 부근에 하루 어긋난다.
     */
    private Long createRecruitment(Club club, User leader, String title) {
        return recruitmentService.create(new CreateRecruitmentCommand(
                club.getId(), leader.getId(), title, null,
                LocalDate.now(clock), LocalDate.now(clock).plusDays(7), 10,
                ApplicationMode.EXTERNAL, "https://forms.gle/aBcD1234", false,
                TargetRole.MEMBER, List.of(), null, null, false
        ));
    }

    /**
     * 지난 모집 이력은 리포지토리로 직접 넣는다 — 생성 API 는 과거 종료일을 막으므로(#887)
     * 서비스 경유로는 만들 수 없다.
     */
    private Recruitment saveClosedRecruitment(Club club, String title,
                                              LocalDate startDate, LocalDate endDate) {
        Recruitment created = recruitmentRepository.save(Recruitment.create(
                club, title + "-" + sequence.getAndIncrement(), null, startDate, endDate, 10));
        created.close(LocalDateTime.now(clock));
        // 마감 UPDATE 를 먼저 내보내야 다음 INSERT 가 uk_recruitment_club_active(동아리당 OPEN 1건)에
        // 걸리지 않는다 — Hibernate 기본 액션 순서가 INSERT 를 UPDATE 앞에 두기 때문이다.
        recruitmentRepository.saveAndFlush(created);
        return created;
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
