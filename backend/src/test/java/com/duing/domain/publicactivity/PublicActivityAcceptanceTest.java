package com.duing.domain.publicactivity;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.clubevent.repository.ClubEventRepository;
import com.duing.domain.fee.entity.BillingType;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.entity.FeeTargetType;
import com.duing.domain.fee.repository.FeePolicyRepository;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeContentFormat;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.repository.NoticeRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.RestAssured;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PublicActivityAcceptanceTest extends IntegrationTestBase {

    @LocalServerPort
    int port;

    @Autowired
    ClubRepository clubRepository;

    @Autowired
    NoticeRepository noticeRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    RecruitmentRepository recruitmentRepository;

    @Autowired
    InterviewRoundRepository interviewRoundRepository;

    @Autowired
    ClubEventRepository clubEventRepository;

    @Autowired
    FeePolicyRepository feePolicyRepository;

    @Autowired
    JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private Long authorId;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        // notice.author_id / event.created_by 등은 users(id) FK 참조 — 활동 시드 전 최소 1명 생성
        long seq = sequence.incrementAndGet();
        User author = userRepository.save(User.create(
                "20" + seq, "작성자" + seq, "author" + seq + "@duing.ac.kr", "hash",
                UserRole.STUDENT, Grade.FRESHMAN, College.IT_ENGINEERING,
                "미설정", "010-0000-0000", LocalDateTime.now()));
        authorId = author.getId();
    }

    @Test
    @DisplayName("비인증 GET /api/v1/public-activities 는 200 을 반환하고 Cache-Control 헤더를 포함한다")
    void unauthenticatedGetReturns200WithCacheControlHeader() {
        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .header("Cache-Control", containsString("max-age=60"))
                .header("Cache-Control", containsString("public"))
                .header("Cache-Control", containsString("stale-while-revalidate=30"));
    }

    @Test
    @DisplayName("ACTIVE 동아리의 PUBLIC 공지는 NOTICE_CREATED 타입으로 피드에 노출되고 ISO 날짜 형식이다")
    void activeClubPublicNoticeAppearsInFeedWithCorrectTypeAndIsoDate() {
        Club activeClub = saveAndActivate("공개공지동아리" + sequence.incrementAndGet());
        savePublicNoticeForClub(activeClub, "공개 공지 제목");

        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("ok", equalTo(true))
                // index 의존 대신 동아리명으로 단일 item 을 특정해 순서 변동에 안전하게 단언한다.
                .body(typeForClub(activeClub), equalTo(List.of("NOTICE_CREATED")))
                .body("data.items.find { it.clubName == '" + activeClub.getName() + "' }.occurredAt",
                        matchesPattern("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?Z"));
    }

    @Test
    @DisplayName("6개 활동 소스(모집·공지·면접생성·면접결과·행사·회비)가 각 타입으로 피드에 노출된다")
    void allSixActivitySourcesAppearInFeedWithCorrectTypes() {
        // RECRUIT_OPEN — status=OPEN 모집
        Club recruitClub = saveAndActivate("모집동아리" + sequence.incrementAndGet());
        saveOpenRecruitment(recruitClub);

        // NOTICE_CREATED — PUBLIC 공지
        Club noticeClub = saveAndActivate("공지동아리" + sequence.incrementAndGet());
        savePublicNoticeForClub(noticeClub, "공개 공지");

        // INTERVIEW_CREATED — COLLECTING 라운드
        Club interviewCreatedClub = saveAndActivate("면접생성동아리" + sequence.incrementAndGet());
        Recruitment interviewCreatedRecruitment = saveOpenRecruitment(interviewCreatedClub);
        saveCollectingRound(interviewCreatedRecruitment.getId());

        // INTERVIEW_RESULT — SCHEDULED + assignmentCompletedAt(확정) 라운드
        Club interviewResultClub = saveAndActivate("면접결과동아리" + sequence.incrementAndGet());
        Recruitment interviewResultRecruitment = saveOpenRecruitment(interviewResultClub);
        saveScheduledRound(interviewResultRecruitment.getId());

        // EVENT_CREATED — ClubEvent
        Club eventClub = saveAndActivate("행사동아리" + sequence.incrementAndGet());
        saveClubEvent(eventClub);

        // FEE_OPEN — active=true FeePolicy
        Club feeClub = saveAndActivate("회비동아리" + sequence.incrementAndGet());
        saveActiveFeePolicy(feeClub);

        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=20")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body(typeForClub(recruitClub), hasItem("RECRUIT_OPEN"))
                .body(typeForClub(noticeClub), hasItem("NOTICE_CREATED"))
                .body(typeForClub(interviewCreatedClub), hasItem("INTERVIEW_CREATED"))
                .body(typeForClub(interviewResultClub), hasItem("INTERVIEW_RESULT"))
                .body(typeForClub(eventClub), hasItem("EVENT_CREATED"))
                .body(typeForClub(feeClub), hasItem("FEE_OPEN"));
    }

    @Test
    @DisplayName("비ACTIVE·소프트삭제 동아리, 비PUBLIC 공지, DRAFT·CANCELLED 면접, inactive 회비, CLOSED 모집은 피드에서 누출되지 않는다")
    void hiddenActivitiesAreExcludedFromFeed() {
        // 1) 비ACTIVE(PENDING) 동아리의 PUBLIC 공지 + 행사
        Club pendingClub = clubRepository.save(
                Club.create("미승인동아리" + sequence.incrementAndGet(),
                        ClubCategory.ACADEMIC, null, "설명", null));
        // 공지(NOTICE_CREATED)·행사(EVENT_CREATED) 둘 다 시드 — 비ACTIVE 동아리는 어느 소스로도 노출되면 안 된다.
        savePublicNoticeForClub(pendingClub, "미승인 공지");
        saveClubEvent(pendingClub);

        // 2) 소프트삭제된 동아리의 활동(공지) — 저장·활성화 후 삭제
        Club deletedClub = saveAndActivate("삭제동아리" + sequence.incrementAndGet());
        savePublicNoticeForClub(deletedClub, "삭제된 동아리 공지");
        clubRepository.delete(deletedClub); // @SQLDelete soft delete

        // 3) ACTIVE 동아리의 비PUBLIC 공지(OFFICERS_ALL)
        Club officersNoticeClub = saveAndActivate("임원공지동아리" + sequence.incrementAndGet());
        saveNonPublicNoticeForClub(officersNoticeClub);

        // 4) DRAFT 면접 라운드 (DRAFT 는 모집당 1개 제약 → 전용 모집)
        Club draftInterviewClub = saveAndActivate("초안면접동아리" + sequence.incrementAndGet());
        Recruitment draftRecruitment = saveOpenRecruitment(draftInterviewClub);
        interviewRoundRepository.save(
                InterviewRound.create(draftRecruitment.getId(), "초안 면접", futureDeadline(), null));

        // 5) CANCELLED 면접 라운드 (별도 모집)
        Club cancelledInterviewClub = saveAndActivate("취소면접동아리" + sequence.incrementAndGet());
        Recruitment cancelledRecruitment = saveOpenRecruitment(cancelledInterviewClub);
        saveCancelledRound(cancelledRecruitment.getId());

        // 6) inactive FeePolicy(active=false)
        Club inactiveFeeClub = saveAndActivate("비활성회비동아리" + sequence.incrementAndGet());
        saveInactiveFeePolicy(inactiveFeeClub);

        // 7) CLOSED 모집
        Club closedRecruitClub = saveAndActivate("마감모집동아리" + sequence.incrementAndGet());
        saveClosedRecruitment(closedRecruitClub);

        var response = RestAssured.given()
                .when().get("/api/v1/public-activities?limit=20")
                .then()
                .statusCode(HttpStatus.OK.value());

        // 비ACTIVE / 소프트삭제 동아리는 응답에 clubName 자체가 전무 — 시드한 공지·행사 모든 소스의 부재를 한 번에 커버한다.
        response.body("data.items.clubName", not(hasItem(pendingClub.getName())));
        response.body("data.items.clubName", not(hasItem(deletedClub.getName())));
        // 비PUBLIC 공지 → NOTICE_CREATED 부재
        response.body(typeForClub(officersNoticeClub), not(hasItem("NOTICE_CREATED")));
        // DRAFT / CANCELLED 면접 → INTERVIEW_CREATED 부재
        response.body(typeForClub(draftInterviewClub), not(hasItem("INTERVIEW_CREATED")));
        response.body(typeForClub(cancelledInterviewClub), not(hasItem("INTERVIEW_CREATED")));
        // inactive 회비 → FEE_OPEN 부재
        response.body(typeForClub(inactiveFeeClub), not(hasItem("FEE_OPEN")));
        // CLOSED 모집 → RECRUIT_OPEN 부재
        response.body(typeForClub(closedRecruitClub), not(hasItem("RECRUIT_OPEN")));
    }

    @Test
    @DisplayName("응답 occurredAt 은 저장된 created_at 을 JVM 기본 존으로 변환한 절대 Instant 와 일치한다")
    void occurredAtEqualsStoredCreatedAtConvertedWithSystemDefaultZone() {
        Club activeClub = saveAndActivate("시각검증동아리" + sequence.incrementAndGet());
        Notice notice = savePublicNoticeForClub(activeClub, "시각 검증 공지");

        // Postgres TIMESTAMP 은 마이크로초까지만 보존(나노초 절삭)하고 응답은 DB 저장값을 직렬화하므로,
        // 기대치도 마이크로초로 절삭해 정밀도를 맞춘다. (Postgres·truncatedTo(MICROS) 모두 floor 절삭이라 일치.)
        Instant expectedOccurredAt = notice.getCreatedAt()
                .truncatedTo(ChronoUnit.MICROS)
                .atZone(ZoneId.systemDefault())
                .toInstant();

        String occurredAtRaw = RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body(typeForClub(activeClub), equalTo(List.of("NOTICE_CREATED")))
                .extract().jsonPath()
                .getString("data.items.find { it.clubName == '" + activeClub.getName() + "' }.occurredAt");

        // 포맷뿐 아니라 값까지 — 9h 타임존 어긋남 재발 방지
        org.assertj.core.api.Assertions.assertThat(Instant.parse(occurredAtRaw))
                .isEqualTo(expectedOccurredAt);
    }

    @Test
    @DisplayName("limit=999 요청 시 최대 허용 limit(20)으로 클램프되어 반환된다")
    void limitIsClampedToMaxLimitOf20() {
        Club activeClub = saveAndActivate("limit테스트동아리" + sequence.incrementAndGet());

        for (int i = 0; i < 25; i++) {
            savePublicNoticeForClub(activeClub, "공지 " + i);
        }

        RestAssured.given()
                .when().get("/api/v1/public-activities?limit=999")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.items", hasSize(20));
    }

    @Test
    @DisplayName("30일 윈도우 밖의 공지(40일 전 작성)는 피드에서 제외된다")
    void noticeOutsideWindowIsExcludedFromFeed() {
        Club activeClub = saveAndActivate("윈도우테스트동아리" + sequence.incrementAndGet());
        Notice oldNotice = savePublicNoticeForClub(activeClub, "오래된 공지");

        backdateNoticeCreatedAt(oldNotice.getId(), 40);

        RestAssured.given()
                .when().get("/api/v1/public-activities")
                .then()
                .statusCode(HttpStatus.OK.value())
                .body("data.items.findAll { it.clubName == '" + activeClub.getName() + "' }",
                        hasSize(0));
    }

    // ---- GPath helpers ----

    /** 특정 동아리명에 해당하는 items 의 type 리스트를 뽑는 GPath. */
    private String typeForClub(Club club) {
        return "data.items.findAll { it.clubName == '" + club.getName() + "' }.type";
    }

    // ---- 시드 헬퍼 ----

    /**
     * Club.create 는 PENDING_APPROVAL 로 생성된다 — ACTIVE 로 만들려면 changeStatus 를 호출한다.
     */
    private Club saveAndActivate(String clubName) {
        Club club = Club.create(clubName, ClubCategory.ACADEMIC, null, "설명", null);
        club.changeStatus(ClubStatus.ACTIVE, null, null);
        return clubRepository.save(club);
    }

    private Notice savePublicNoticeForClub(Club club, String title) {
        Notice notice = Notice.create(
                title, "요약", "내용", "", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.PUBLIC, null,
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN,
                authorId);
        notice.assignOwningClub(club.getId());
        return noticeRepository.save(notice);
    }

    private Notice saveNonPublicNoticeForClub(Club club) {
        Notice notice = Notice.create(
                "임원 전용 공지", "요약", "내용", "", null,
                NoticeCategory.GENERAL, List.of(),
                NoticeVisibility.OFFICERS_ALL, null,
                false, null, false,
                null, null, null, null, null, NoticeContentFormat.MARKDOWN,
                authorId);
        notice.assignOwningClub(club.getId());
        return noticeRepository.save(notice);
    }

    private Recruitment saveOpenRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.create(
                club, "모집 공고", "내용",
                LocalDate.now(), LocalDate.now().plusDays(14), 10));
    }

    private Recruitment saveClosedRecruitment(Club club) {
        Recruitment recruitment = Recruitment.create(
                club, "마감 모집", "내용",
                LocalDate.now(), LocalDate.now().plusDays(14), 10);
        recruitment.close();
        return recruitmentRepository.save(recruitment);
    }

    /** DRAFT → COLLECTING 전이. 발송 가드: 마감이 미래여야 한다. */
    private InterviewRound saveCollectingRound(Long recruitmentId) {
        InterviewRound round = InterviewRound.create(recruitmentId, "1차 면접", futureDeadline(), null);
        round.openCollecting(LocalDateTime.now());
        return interviewRoundRepository.save(round);
    }

    /** DRAFT → COLLECTING → ASSIGNING → SCHEDULED(확정). confirm 이 assignmentCompletedAt 을 기록한다. */
    private InterviewRound saveScheduledRound(Long recruitmentId) {
        InterviewRound round = InterviewRound.create(recruitmentId, "확정 면접", futureDeadline(), null);
        round.openCollecting(LocalDateTime.now());
        round.openAssigning();
        round.confirm(LocalDateTime.now());
        return interviewRoundRepository.save(round);
    }

    /** DRAFT → CANCELLED. */
    private InterviewRound saveCancelledRound(Long recruitmentId) {
        InterviewRound round = InterviewRound.create(recruitmentId, "취소 면접", futureDeadline(), null);
        round.cancel();
        return interviewRoundRepository.save(round);
    }

    private ClubEvent saveClubEvent(Club club) {
        return clubEventRepository.save(ClubEvent.create(
                club.getId(), "동아리 행사", "행사 설명",
                LocalDateTime.now().plusDays(1), LocalDateTime.now().plusDays(1).plusHours(2),
                "중앙광장", authorId));
    }

    private FeePolicy saveActiveFeePolicy(Club club) {
        return feePolicyRepository.save(FeePolicy.create(
                club.getId(), "정기 회비", 10000L, BillingType.SEMESTER, FeeTargetType.ALL_MEMBERS));
    }

    private FeePolicy saveInactiveFeePolicy(Club club) {
        FeePolicy policy = FeePolicy.create(
                club.getId(), "비활성 회비", 10000L, BillingType.SEMESTER, FeeTargetType.ALL_MEMBERS);
        policy.update(null, null, null, false); // active=false 로 전환
        return feePolicyRepository.save(policy);
    }

    private LocalDateTime futureDeadline() {
        return LocalDateTime.now().plusDays(7);
    }

    private void backdateNoticeCreatedAt(Long noticeId, int daysAgo) {
        jdbcTemplate.update(
                "UPDATE notice SET created_at = ? WHERE id = ?",
                LocalDateTime.now().minusDays(daysAgo),
                noticeId);
    }
}
