package com.duing.domain.application.controller;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundMemberStatus;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepository;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
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
import io.restassured.RestAssured;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

// 운영진 지원자 상세 응답에 면접 가능시간 목록과 현재 배정 슬롯이
// 노출되는지 검증한다. Spec P0-2.
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class LeaderApplicantDetailInterviewTest extends IntegrationTestBase {

    @LocalServerPort
    private int port;

    @Autowired private UserRepository userRepository;
    @Autowired private ClubRepository clubRepository;
    @Autowired private ClubMemberRepository clubMemberRepository;
    @Autowired private RecruitmentRepository recruitmentRepository;
    @Autowired private ApplicationRepository applicationRepository;
    @Autowired private InterviewRoundRepository interviewRoundRepository;
    @Autowired private InterviewRoundMemberRepository interviewRoundMemberRepository;
    @Autowired private InterviewSlotRepository interviewSlotRepository;
    @Autowired private InterviewAvailabilityRepository interviewAvailabilityRepository;
    @Autowired private InterviewScheduleRepository interviewScheduleRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
    }

    @Test
    @DisplayName("운영진은 지원자가 선택한 면접 가능시간 목록을 startTime 오름차순으로 응답받는다")
    void availabilitiesAreReturnedInStartTimeAscOrder() {
        User leader = saveUser("리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("정렬확인동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "정렬확인모집");
        InterviewRound round = saveCollectingRound(recruitment);

        // 일부러 늦은 슬롯을 먼저 저장해 startTime ASC 정렬 검증이 의미를 갖도록 한다.
        InterviewSlot lateSlot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 20, 16, 0),
                LocalDateTime.of(2026, 6, 20, 16, 30),
                3));
        InterviewSlot earlySlot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 20, 14, 0),
                LocalDateTime.of(2026, 6, 20, 14, 30),
                3));

        User applicant = saveUser("지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), lateSlot.getId(), round.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), earlySlot.getId(), round.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilities", hasSize(2))
                .body("data.interviewAvailabilities.slotId",
                        contains(earlySlot.getId().intValue(), lateSlot.getId().intValue()))
                .body("data.interviewAvailabilities[0].startTime", equalTo("2026-06-20T14:00:00"))
                .body("data.interviewAvailabilities[0].endTime", equalTo("2026-06-20T14:30:00"))
                .body("data.assignedSlot", nullValue());
    }

    @Test
    @DisplayName("운영진은 현재 배정된 슬롯을 assignedSlot 으로 응답받는다")
    void assignedSlotIsReturnedWhenScheduled() {
        User leader = saveUser("배정리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("배정동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "배정모집");
        InterviewRound round = saveCollectingRound(recruitment);

        InterviewSlot slot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                3));

        User applicant = saveUser("배정지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), round.getId()));
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilities", hasSize(1))
                .body("data.assignedSlot.slotId", equalTo(slot.getId().intValue()))
                .body("data.assignedSlot.startTime", equalTo("2026-06-20T18:00:00"))
                .body("data.assignedSlot.endTime", equalTo("2026-06-20T18:30:00"));
    }

    @Test
    @DisplayName("InterviewSchedule 이 CANCELLED 상태이면 assignedSlot 은 null 로 응답된다")
    void cancelledScheduleIsTreatedAsNotAssigned() {
        User leader = saveUser("취소리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("취소동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "취소모집");
        InterviewRound round = saveCollectingRound(recruitment);

        InterviewSlot slot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                3));

        User applicant = saveUser("취소지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), slot.getId(), round.getId()));
        InterviewSchedule schedule = interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), slot.getId(), round.getId(), LocalDateTime.now()));
        // CANCELLED 는 status 만 바뀌는 도메인 취소이며 soft delete 가 아니다 — 취소 전이 메서드는
        // 라운드 API PR(BE#3~)에서 TDD 로 도입되므로 리플렉션으로 세팅한다 (saveActiveClub 전례).
        // 운영진 상세에서도 CANCELLED 는 "배정 없음" 으로 노출되어야 한다.
        ReflectionTestUtils.setField(schedule, "status", InterviewScheduleStatus.CANCELLED);
        interviewScheduleRepository.save(schedule);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilities", hasSize(1))
                .body("data.assignedSlot", nullValue());
    }

    @Test
    @DisplayName("선택한 가능시간이 없으면 interviewAvailabilities 는 빈 배열, assignedSlot 은 null 로 응답된다")
    void emptyAvailabilitiesAndNoAssigned() {
        User leader = saveUser("빈리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("빈동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "빈모집");

        User applicant = saveUser("미선택지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilities", hasSize(0))
                .body("data.assignedSlot", nullValue());
    }

    @Test
    @DisplayName("soft-deleted 슬롯을 참조하는 가능시간/배정은 응답에서 제외된다")
    void softDeletedSlotIsExcludedFromAvailabilitiesAndAssigned() {
        User leader = saveUser("soft리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("soft동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "soft모집");
        InterviewRound round = saveCollectingRound(recruitment);

        // 살아있는 슬롯 1 + soft-delete 될 슬롯 1.
        InterviewSlot keptSlot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 21, 14, 0),
                LocalDateTime.of(2026, 6, 21, 14, 30),
                3));
        InterviewSlot deletedSlot = interviewSlotRepository.save(InterviewSlot.create(
                round.getId(),
                LocalDateTime.of(2026, 6, 21, 15, 0),
                LocalDateTime.of(2026, 6, 21, 15, 30),
                3));

        User applicant = saveUser("soft지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), keptSlot.getId(), round.getId()));
        interviewAvailabilityRepository.save(InterviewAvailability.create(
                application.getId(), deletedSlot.getId(), round.getId()));
        // 배정도 deleted 슬롯으로 걸어 둔다 — 같이 사라져야 한다.
        interviewScheduleRepository.save(InterviewSchedule.create(
                application.getId(), deletedSlot.getId(), round.getId(), LocalDateTime.now()));

        // 슬롯을 soft-delete 한다 (@SQLDelete → deleted_at IS NOT NULL).
        interviewSlotRepository.delete(deletedSlot);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                // soft-deleted 슬롯을 가리키는 availability 는 제외되어 살아있는 슬롯 1개만 노출.
                .body("data.interviewAvailabilities", hasSize(1))
                .body("data.interviewAvailabilities[0].slotId", equalTo(keptSlot.getId().intValue()))
                // 배정 슬롯도 soft-deleted 이므로 null 로 응답된다.
                .body("data.assignedSlot", nullValue());
    }

    // ─── interviewRound brief 신규 테스트 (계획 §4) ─────────────────────────────

    @Test
    @DisplayName("DRAFT 상태 라운드의 멤버십도 interviewRound brief 에 노출된다")
    void draftRoundMembershipIsExposedInInterviewRoundBrief() {
        User leader = saveUser("draft라운드리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("draft라운드동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "draft라운드모집");
        // DRAFT 라운드 — availabilityDeadline 없이 생성
        InterviewRound draftRound = interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(recruitment.getId(), null, null, RoundStatus.DRAFT));

        User applicant = saveUser("draft라운드지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(draftRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewRound", notNullValue())
                .body("data.interviewRound.roundId", equalTo(draftRound.getId().intValue()))
                .body("data.interviewRound.roundStatus", equalTo("DRAFT"))
                .body("data.interviewRound.memberStatus", equalTo("INVITED"))
                .body("data.interviewRound.unresponded", equalTo(false));
    }

    @Test
    @DisplayName("COLLECTING 라운드 마감 후 INVITED 멤버는 unresponded true 로 응답된다")
    void invitedMemberAfterDeadlineIsMarkedUnresponded() {
        User leader = saveUser("마감후리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("마감후동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "마감후모집");
        // 마감이 이미 지난 COLLECTING 라운드
        InterviewRound pastDeadlineRound = interviewRoundRepository.save(
                InterviewRoundFixture.withStatus(
                        recruitment.getId(), LocalDateTime.now().minusHours(1), null, RoundStatus.COLLECTING));

        User applicant = saveUser("마감후지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        interviewRoundMemberRepository.save(InterviewRoundMember.invite(pastDeadlineRound.getId(), application.getId()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewRound", notNullValue())
                .body("data.interviewRound.memberStatus", equalTo("INVITED"))
                .body("data.interviewRound.unresponded", equalTo(true));
    }

    @Test
    @DisplayName("NO_AVAILABLE_SLOT 상태 멤버는 alternativeAvailabilityText 가 응답에 포함된다")
    void noAvailableSlotMemberHasAlternativeTextInBrief() {
        User leader = saveUser("사유리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("사유동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "사유모집");
        InterviewRound round = saveCollectingRound(recruitment);

        User applicant = saveUser("사유지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        member.reportNoAvailableSlot("출장 일정으로 모든 시간대 참석이 어렵습니다.");
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewRound", notNullValue())
                .body("data.interviewRound.memberStatus", equalTo("NO_AVAILABLE_SLOT"))
                .body("data.interviewRound.alternativeAvailabilityText",
                        equalTo("출장 일정으로 모든 시간대 참석이 어렵습니다."))
                .body("data.interviewRound.unresponded", equalTo(false));
    }

    @Test
    @DisplayName("placement-active 멤버십이 없는 지원자는 interviewRound 가 null 로 응답된다")
    void applicantWithoutPlacementActiveMembershipHasNullInterviewRound() {
        User leader = saveUser("멤버없는리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("멤버없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "멤버없는모집");

        User applicant = saveUser("멤버없는지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        // 멤버십 없이 지원서만 존재

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewRound", nullValue());
    }

    @Test
    @DisplayName("EXCLUDED 멤버십만 있는 지원자는 interviewRound 가 null 로 응답된다 (대기열 복귀 상태)")
    void excludedOnlyMembershipResultsInNullInterviewRound() {
        User leader = saveUser("제외된리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("제외된동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "제외된모집");
        InterviewRound round = saveCollectingRound(recruitment);

        User applicant = saveUser("제외된지원자");
        Application application = saveInterviewPendingApplication(recruitment, applicant);
        InterviewRoundMember member = InterviewRoundMember.invite(round.getId(), application.getId());
        member.exclude();
        interviewRoundMemberRepository.save(member);

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewRound", nullValue());
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 지원자 상세는 interviewAvailabilities 빈 배열, assignedSlot null 로 응답된다")
    void useInterviewFalseReturnsEmptyAvailabilitiesAndNullAssigned() {
        User leader = saveUser("면접없는리더");
        String leaderToken = jwtTokenProvider.createToken(leader.getId(), leader.getRole().name());

        Club club = saveActiveClub("면접없는동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveSimpleRecruitment(club, "면접없는모집");

        User applicant = saveUser("면접없는지원자");
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        RestAssured.given()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + leaderToken)
                .when().get("/api/v1/leader/applications/{id}", application.getId())
                .then().statusCode(HttpStatus.OK.value())
                .body("data.interviewAvailabilities", hasSize(0))
                .body("data.assignedSlot", nullValue());
    }

    private User saveUser(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "leaderDetail" + unique + "@daegu.ac.kr",
                "hash",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터공학",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) {
        Club club = Club.create(name + sequence.incrementAndGet(),
                ClubCategory.ACADEMIC, "공학계열", "설명", null);
        ReflectionTestUtils.setField(club, "status", ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveInterviewRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.createWithOptions(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10,
                ApplicationMode.SELF, null,
                true, TargetRole.MEMBER,
                today.plusDays(7), today.plusDays(14),
                false);
        return recruitmentRepository.save(recruitment);
    }

    private Recruitment saveSimpleRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        Recruitment recruitment = Recruitment.create(club,
                title + "-" + sequence.incrementAndGet(), null,
                today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private InterviewRound saveCollectingRound(Recruitment recruitment) {
        return interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(7), null, RoundStatus.COLLECTING));
    }

    private Application saveInterviewPendingApplication(Recruitment recruitment, User user) {
        Application application = Application.submit(recruitment, user, List.of());
        ReflectionTestUtils.setField(application, "status", ApplicationStatus.INTERVIEW_PENDING);
        return applicationRepository.save(application);
    }
}
