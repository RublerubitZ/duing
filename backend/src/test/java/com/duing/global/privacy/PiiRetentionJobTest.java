package com.duing.global.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.draft.entity.ApplicationDraft;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "duing.privacy.retention.enabled=true",
        "duing.privacy.retention.window=P1Y"
})
class PiiRetentionJobTest extends IntegrationTestBase {

    @Autowired PiiRetentionJob job;
    @Autowired UserRepository userRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired PhoneVerificationRepository phoneVerificationRepository;
    @Autowired PhoneVerificationEventRepository phoneVerificationEventRepository;
    @Autowired ApplicationDraftRepository applicationDraftRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired ObjectMapper objectMapper;

    /** 관리자 메모는 자유서술 칸이라 실제로 이름·번호가 적힌다 — 익명화 여부를 이 값으로 판정한다. */
    private static final String ADMIN_NOTE = "본인확인 완료 — 김도윤 010-1234-5678";

    /** 자유서술 칸에 실제로 적히는 형태 — 이름·학번·번호. 파기 여부를 이 값으로 판정한다. */
    private static final String TEXT_ANSWER = "홍길동 20231234 010-1234-5678";

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("보관기간을 넘긴 soft-delete 사용자는 PII 가 비식별화되고 anonymized_at 이 기록된다")
    void anonymizesExpiredSoftDeletedUser() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 400); // 1년(window) 초과

        job.run();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT name, student_id, phone, password_hash, major, admin_note, anonymized_at "
                        + "FROM users WHERE id = ?",
                user.getId());
        assertThat(row.get("name")).isEqualTo("탈퇴회원");
        assertThat(row.get("student_id")).isEqualTo("anon_" + user.getId());
        assertThat(row.get("phone")).isEqualTo("010-0000-0000");
        assertThat(row.get("password_hash")).isEqualTo("");
        // 관리자 메모는 자유서술이라 이름·번호가 그대로 남을 수 있다 — 익명화 대상이다.
        assertThat(row.get("admin_note")).isNull();
        assertThat(row.get("anonymized_at")).isNotNull();
    }

    @Test
    @DisplayName("보관기간 내(최근) soft-delete 사용자는 비식별화되지 않는다")
    void keepsRecentlyDeletedUser() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 10);

        job.run();

        assertThat(userAnonymizedAt(user.getId())).isNull();
        assertThat(userName(user.getId())).isEqualTo("보관테스터");
        assertThat(userAdminNote(user.getId())).isEqualTo(ADMIN_NOTE);
    }

    @Test
    @DisplayName("이미 익명화된 행은 재실행해도 다시 변형되지 않는다 (멱등)")
    void isIdempotentForAlreadyAnonymized() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 400);

        job.run();
        java.sql.Timestamp firstAnonymizedAt = userAnonymizedAt(user.getId());
        job.run();
        java.sql.Timestamp secondAnonymizedAt = userAnonymizedAt(user.getId());

        assertThat(secondAnonymizedAt).isEqualTo(firstAnonymizedAt); // anonymized_at 가드로 이중 변형 없음
        assertThat(userName(user.getId())).isEqualTo("탈퇴회원");
        assertThat(userAdminNote(user.getId())).isNull();
    }

    @Test
    @DisplayName("활성(미삭제) 사용자는 보관기간과 무관하게 절대 비식별화되지 않는다")
    void neverTouchesActiveUser() {
        User user = saveUser();
        // soft-delete 하지 않음 (deleted_at IS NULL)

        job.run();

        assertThat(userAnonymizedAt(user.getId())).isNull();
    }

    @Test
    @DisplayName("비활성(enabled=false) 잡은 보관기간 초과 행도 건드리지 않는다")
    void noopWhenDisabled() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 400);

        PiiRetentionJob disabledJob = new PiiRetentionJob(
                new RetentionProperties(false, Period.ofYears(1), Period.ofMonths(6)),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository, applicationDraftRepository);
        disabledJob.run();

        assertThat(userAnonymizedAt(user.getId())).isNull();
    }

    @Test
    @DisplayName("보관기간이 0/음수로 잘못 설정되면 활성 상태여도 만료 행을 건드리지 않는다 (오설정 안전장치)")
    void noopWhenWindowNonPositive() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 400);

        PiiRetentionJob zeroWindowJob = new PiiRetentionJob(
                new RetentionProperties(true, Period.ZERO, Period.ofMonths(6)),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository, applicationDraftRepository);
        zeroWindowJob.run();

        assertThat(userAnonymizedAt(user.getId())).isNull();
    }

    @Test
    @DisplayName("보관기간을 넘긴 soft-delete 지원서의 답변(jsonb)은 비워진다")
    void scrubsExpiredApplicationAnswers() throws Exception {
        Club club = saveActiveClub("보관동아리");
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "보관모집", null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        User applicant = saveUser();
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant,
                        List.of(new ApplicationAnswer("q1", List.of("주소·연락처 등 개인정보 답변")))));
        softDeleteDaysAgo("application", application.getId(), 400);

        job.run();

        String answers = jdbcTemplate.queryForObject(
                "SELECT answers::text FROM application WHERE id = ?", String.class, application.getId());
        assertThat(answers).isEqualTo("[]");
    }

    @Test
    @DisplayName("탈퇴 후 보관기간(window) 미만인 회원의 지원서 자유서술 답변은 유지된다")
    void keepsAnswersOfRecentlyWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        softDeleteDaysAgo("users", applicant.getId(), 10);

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("탈퇴 후 보관기간(window)이 지난 회원의 지원서는 TEXT 답변만 파기 문구로 치환되고 선택형 답변은 유지된다")
    void purgesTextAnswersOfWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        Long versionBefore = applicationVersion(application.getId());
        softDeleteDaysAgo("users", applicant.getId(), 400);

        job.run();

        assertPurged(application, fixture);
        // 동시 flush 가 파기 전 answers 를 되살리지 못하도록 version 이 올라간다(스펙 §3.2).
        assertThat(applicationVersion(application.getId())).isEqualTo(versionBefore + 1);
    }

    @Test
    @DisplayName("마감(closed_at) 후 6개월 미만인 모집의 지원서 답변은 유지된다")
    void keepsAnswersOfRecentlyClosedRecruitment() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 30);

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("마감(closed_at) 후 6개월이 지난 모집의 지원서는 TEXT 답변이 파기된다")
    void purgesTextAnswersAfterClosedAtWindow() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("end_date 가 지난 뒤 6개월이 넘은 OPEN 모집(만료-OPEN)의 지원서도 파기되며 모집 상태는 OPEN 그대로다")
    void purgesExpiredOpenRecruitmentWithoutClosingIt() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        setEndDateDaysAgo(fixture.id(), 210);

        job.run();

        assertPurged(application, fixture);
        assertThat(recruitmentStatus(fixture.id())).isEqualTo("OPEN");
    }

    @Test
    @DisplayName("closed_at 이 없는(V101 이전) CLOSED 모집은 end_date 기준으로 파기된다")
    void purgesLegacyClosedRecruitmentByEndDate() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        // start_date 도 함께 과거로 — recruitment 는 end_date >= start_date CHECK(chk_recruitment_period)를 건다.
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED', closed_at = NULL, "
                        + "start_date = CURRENT_DATE - 270, end_date = CURRENT_DATE - 240 WHERE id = ?",
                fixture.id());

        job.run();

        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("상시모집이면서 closed_at 이 없는 CLOSED 모집은 마감 앵커가 없어 건너뛴다")
    void skipsRecruitmentWithoutAnyAnchor() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(null);
        Application application = saveApplication(fixture, saveUser());
        jdbcTemplate.update("UPDATE recruitment SET status = 'CLOSED' WHERE id = ?", fixture.id());

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("아직 마감되지 않은(end_date 미래) OPEN 모집의 지원서는 파기하지 않는다")
    void keepsAnswersOfOpenRecruitment() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());

        job.run();

        assertUntouched(application, fixture);
    }

    @Test
    @DisplayName("폼에 없는 questionId 와 questionId 가 null 인 답변은 TEXT 로 간주해 파기한다")
    void treatsUnresolvedAnswersAsText() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer("question-no-longer-in-form", List.of("삭제된 질문의 답 010-2222-3333")),
                new ApplicationAnswer(null, List.of("V78 잉여 답변")))));
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(answerValues(application.getId(), "question-no-longer-in-form").get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
        assertThat(answerValues(application.getId(), null).get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
    }

    @Test
    @DisplayName("무응답([\"\"])·빈([]) TEXT 답변과 답변이 없는 지원서는 내용이 바뀌지 않고 파기 마커만 기록된다")
    void leavesEmptyAnswersUntouchedButMarksPurged() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application blankAnswer = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer(fixture.text().id(), List.of("")),
                new ApplicationAnswer(fixture.single().id(), List.of(fixture.singleChoiceId())))));
        Application noValues = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of(
                new ApplicationAnswer(fixture.text().id(), List.of()))));
        Application noAnswers = applicationRepository.save(Application.submit(fixture.recruitment(), saveUser(), List.of()));
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(answerValues(blankAnswer.getId(), fixture.text().id()).get(0).asText()).isEqualTo("");
        assertThat(answerValues(noValues.getId(), fixture.text().id()).size()).isZero();
        assertThat(answersText(noAnswers.getId())).isEqualTo("[]");
        assertThat(answersPurgedAt(blankAnswer.getId())).isNotNull();
        assertThat(answersPurgedAt(noValues.getId())).isNotNull();
        assertThat(answersPurgedAt(noAnswers.getId())).isNotNull();
    }

    @Test
    @DisplayName("한 번 파기된 지원서는 재실행해도 다시 갱신되지 않는다 (멱등)")
    void isIdempotentForPurgedAnswers() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application application = saveApplication(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();
        java.sql.Timestamp firstPurgedAt = answersPurgedAt(application.getId());
        Long firstVersion = applicationVersion(application.getId());
        job.run();

        assertThat(answersPurgedAt(application.getId())).isEqualTo(firstPurgedAt);
        assertThat(applicationVersion(application.getId())).isEqualTo(firstVersion);
        assertPurged(application, fixture);
    }

    @Test
    @DisplayName("여러 모집·여러 지원서가 섞여 있어도 각 행이 자기 조건으로만 판정된다")
    void judgesEachApplicationIndependently() throws Exception {
        RecruitmentFixture closedLongAgo = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture closedRecently = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture stillOpen = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        Application purgedByClose = saveApplication(closedLongAgo, saveUser());
        Application keptRecentClose = saveApplication(closedRecently, saveUser());
        User withdrawnApplicant = saveUser();
        Application purgedByWithdrawal = saveApplication(closedRecently, withdrawnApplicant);
        Application keptOpen = saveApplication(stillOpen, saveUser());
        closeDaysAgo(closedLongAgo.id(), 210);
        closeDaysAgo(closedRecently.id(), 30);
        softDeleteDaysAgo("users", withdrawnApplicant.getId(), 400);

        job.run();

        assertPurged(purgedByClose, closedLongAgo);
        assertUntouched(keptRecentClose, closedRecently);
        assertPurged(purgedByWithdrawal, closedRecently);
        assertUntouched(keptOpen, stillOpen);
    }

    @Test
    @DisplayName("만료 후 1일이 지난 MO 인증 세션은 window(보관기간) 설정과 무관하게 물리 삭제된다")
    void deletesExpiredPhoneVerifications() {
        PhoneVerification staleVerification = phoneVerificationRepository.save(
                PhoneVerification.issue("010-9001-0000", "stale-mo-token",
                        VerificationPurpose.SIGNUP, null, LocalDateTime.now()));
        // window(1년)로는 아직 멀었지만, 전용 유예(1일)는 넘긴 값 — 별도 cutoff 계약을 검증한다.
        jdbcTemplate.update(
                "UPDATE phone_verifications SET expires_at = NOW() - INTERVAL '5 days' WHERE id = ?",
                staleVerification.getId());

        job.run();

        assertThat(phoneVerificationRepository.findById(staleVerification.getId())).isEmpty();
    }

    @Test
    @DisplayName("만료된 지 1일이 안 된 MO 인증 세션은 아직 삭제되지 않는다 (유예)")
    void keepsRecentlyExpiredPhoneVerification() {
        PhoneVerification recentlyExpired = phoneVerificationRepository.save(
                PhoneVerification.issue("010-9002-0000", "recent-mo-token",
                        VerificationPurpose.SIGNUP, null, LocalDateTime.now()));
        jdbcTemplate.update(
                "UPDATE phone_verifications SET expires_at = NOW() - INTERVAL '12 hours' WHERE id = ?",
                recentlyExpired.getId());

        job.run();

        assertThat(phoneVerificationRepository.findById(recentlyExpired.getId())).isPresent();
    }

    @Test
    @DisplayName("보관기간을 넘긴 MO 인증 감사 이벤트는 물리 삭제된다")
    void deletesExpiredPhoneVerificationEvents() {
        PhoneVerification verification = phoneVerificationRepository.save(
                PhoneVerification.issue("010-9003-0000", "event-mo-token",
                        VerificationPurpose.SIGNUP, null, LocalDateTime.now()));
        PhoneVerificationEvent event = phoneVerificationEventRepository.save(
                PhoneVerificationEvent.verified(verification, "127.0.0.1", "junit-agent"));
        jdbcTemplate.update(
                "UPDATE phone_verification_events SET created_at = NOW() - (400 * INTERVAL '1 day') WHERE id = ?",
                event.getId());

        job.run();

        assertThat(phoneVerificationEventRepository.findById(event.getId())).isEmpty();
    }

    @Test
    @DisplayName("MO 세션 전용 유예(1일)는 지났어도 보관기간(window) 내인 감사 이벤트는 삭제되지 않는다 "
            + "— 이벤트가 window cutoff 를 그대로 재사용함을 검증한다")
    void keepsPhoneVerificationEventWithinWindow() {
        PhoneVerification verification = phoneVerificationRepository.save(
                PhoneVerification.issue("010-9004-0000", "within-window-mo-token",
                        VerificationPurpose.SIGNUP, null, LocalDateTime.now()));
        PhoneVerificationEvent event = phoneVerificationEventRepository.save(
                PhoneVerificationEvent.verified(verification, "127.0.0.1", "junit-agent"));
        // MO 세션 전용 유예(1일)는 지났지만 window(1년)는 한참 남은 값 — 이벤트 삭제가 1일 유예를
        // 잘못 재사용하면(phone_verifications 와 cutoff 를 혼동하면) 이 값도 삭제돼 테스트가 실패한다.
        jdbcTemplate.update(
                "UPDATE phone_verification_events SET created_at = NOW() - INTERVAL '10 days' WHERE id = ?",
                event.getId());

        job.run();

        assertThat(phoneVerificationEventRepository.findById(event.getId())).isPresent();
    }

    @Test
    @DisplayName("마감 6개월이 지난 모집의 미제출 초안은 삭제된다")
    void deletesDraftsOfRecruitmentClosedLongAgo() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        ApplicationDraft draft = saveDraft(fixture, saveUser());
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
    }

    @Test
    @DisplayName("탈퇴 후 보관기간(window)이 지난 회원의 미제출 초안은 삭제된다")
    void deletesDraftsOfWithdrawnUser() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User withdrawnUser = saveUser();
        ApplicationDraft draft = saveDraft(fixture, withdrawnUser);
        softDeleteDaysAgo("users", withdrawnUser.getId(), 400);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
    }

    @Test
    @DisplayName("최근 마감한 모집·활성 회원의 미제출 초안은 유지된다")
    void keepsRecentDrafts() throws Exception {
        RecruitmentFixture recentlyClosed = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        RecruitmentFixture stillOpen = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        ApplicationDraft recentDraft = saveDraft(recentlyClosed, saveUser());
        ApplicationDraft openDraft = saveDraft(stillOpen, saveUser());
        closeDaysAgo(recentlyClosed.id(), 30);

        job.run();

        assertThat(draftCount(recentDraft.getId())).isEqualTo(1);
        assertThat(draftCount(openDraft.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("초안 삭제는 같은 회원·모집의 제출된 지원서 행을 건드리지 않는다")
    void draftDeletionLeavesSubmittedApplicationRow() throws Exception {
        RecruitmentFixture fixture = saveRecruitmentWithForm(LocalDate.now().plusDays(30));
        User applicant = saveUser();
        Application application = saveApplication(fixture, applicant);
        ApplicationDraft draft = saveDraft(fixture, applicant);
        closeDaysAgo(fixture.id(), 210);

        job.run();

        assertThat(draftCount(draft.getId())).isZero();
        assertThat(applicationCount(application.getId())).isEqualTo(1);
        assertPurged(application, fixture);
    }

    private String userName(Long id) {
        return jdbcTemplate.queryForObject("SELECT name FROM users WHERE id = ?", String.class, id);
    }

    private String userAdminNote(Long id) {
        return jdbcTemplate.queryForObject("SELECT admin_note FROM users WHERE id = ?", String.class, id);
    }

    private java.sql.Timestamp userAnonymizedAt(Long id) {
        return jdbcTemplate.queryForObject(
                "SELECT anonymized_at FROM users WHERE id = ?", java.sql.Timestamp.class, id);
    }

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        User user = User.create(
                String.format("%010d", seq % 10_000_000_000L),
                "보관테스터", "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                "010-" + String.format("%04d", seq % 10000) + "-0000", LocalDateTime.now());
        user.changeAdminNote(ADMIN_NOTE);
        return userRepository.save(user);
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private void softDeleteDaysAgo(String table, Long id, int days) {
        jdbcTemplate.update(
                "UPDATE " + table + " SET deleted_at = NOW() - (? * INTERVAL '1 day') WHERE id = ?", days, id);
    }

    /** TEXT·단일선택·복수선택 질문을 가진 모집 — 파기 대상(TEXT)과 유지 대상(선택형)을 한 지원서에서 함께 검증한다. */
    private RecruitmentFixture saveRecruitmentWithForm(LocalDate endDate) throws Exception {
        Club club = saveActiveClub("보관동아리");
        Recruitment recruitment = Recruitment.create(club, "보관모집", null, LocalDate.now().minusDays(30), endDate, 10);
        RecruitmentQuestion textQuestion = RecruitmentQuestion.createText("자기소개");
        RecruitmentQuestion singleQuestion = RecruitmentQuestion.create("학년", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("1학년"), QuestionChoice.create("2학년")));
        RecruitmentQuestion multiQuestion = RecruitmentQuestion.create("관심 분야", QuestionType.MULTIPLE_CHOICE, false,
                List.of(QuestionChoice.create("프론트"), QuestionChoice.create("백엔드")));
        recruitment.attachForm(RecruitmentForm.create(recruitment, List.of(textQuestion, singleQuestion, multiQuestion)));
        return new RecruitmentFixture(recruitmentRepository.save(recruitment), textQuestion, singleQuestion, multiQuestion);
    }

    private record RecruitmentFixture(Recruitment recruitment, RecruitmentQuestion text,
                                      RecruitmentQuestion single, RecruitmentQuestion multi) {
        Long id() {
            return recruitment.getId();
        }

        String singleChoiceId() {
            return single.choices().get(0).id();
        }

        List<String> multiChoiceIds() {
            return List.of(multi.choices().get(0).id(), multi.choices().get(1).id());
        }
    }

    /** TEXT 에 개인정보, 선택형 두 개에 choiceId 를 채운 지원서. */
    private Application saveApplication(RecruitmentFixture fixture, User applicant) {
        return applicationRepository.save(Application.submit(fixture.recruitment(), applicant, List.of(
                new ApplicationAnswer(fixture.text().id(), List.of(TEXT_ANSWER)),
                new ApplicationAnswer(fixture.single().id(), List.of(fixture.singleChoiceId())),
                new ApplicationAnswer(fixture.multi().id(), fixture.multiChoiceIds()))));
    }

    /** 제출 전 임시 저장 초안 — 자유서술 칸에 개인정보가 그대로 남는다. */
    private ApplicationDraft saveDraft(RecruitmentFixture fixture, User user) {
        return applicationDraftRepository.save(ApplicationDraft.create(user.getId(), fixture.id(), List.of(
                new ApplicationDraft.DraftAnswer(fixture.text().id(), List.of("초안 " + TEXT_ANSWER)))));
    }

    private int draftCount(Long draftId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM application_draft WHERE id = ?", Integer.class, draftId);
    }

    private int applicationCount(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT count(*) FROM application WHERE id = ?", Integer.class, applicationId);
    }

    /** 수동 마감: status=CLOSED + closed_at = N일 전 (seoul 벽시계 컬럼이지만 마진이 커서 DB NOW() 로 충분). */
    private void closeDaysAgo(Long recruitmentId, int days) {
        jdbcTemplate.update(
                "UPDATE recruitment SET status = 'CLOSED', closed_at = NOW() - (? * INTERVAL '1 day') WHERE id = ?",
                days, recruitmentId);
    }

    /**
     * 접수 마감일만 과거로 — status 는 건드리지 않는다(만료-OPEN 재현용).
     * start_date 도 같이 당긴다: recruitment 에 end_date >= start_date CHECK(chk_recruitment_period)가 걸려 있다.
     */
    private void setEndDateDaysAgo(Long recruitmentId, int days) {
        jdbcTemplate.update(
                "UPDATE recruitment SET start_date = CURRENT_DATE - ? - 30, end_date = CURRENT_DATE - ? WHERE id = ?",
                days, days, recruitmentId);
    }

    private JsonNode answerValues(Long applicationId, String questionId) throws Exception {
        String answers = jdbcTemplate.queryForObject(
                "SELECT answers::text FROM application WHERE id = ?", String.class, applicationId);
        for (JsonNode answer : objectMapper.readTree(answers)) {
            JsonNode storedQuestionId = answer.get("questionId");
            // 키 자체가 빠진 원소도 null questionId 로 본다(Hibernate 기본 매퍼는 null 을 쓰지만 방어).
            boolean storedIsNull = storedQuestionId == null || storedQuestionId.isNull();
            boolean matches = questionId == null ? storedIsNull
                    : !storedIsNull && questionId.equals(storedQuestionId.asText());
            if (matches) {
                return answer.get("values");
            }
        }
        throw new AssertionError("questionId 에 해당하는 답변이 없습니다: " + questionId);
    }

    private String answersText(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT answers::text FROM application WHERE id = ?", String.class, applicationId);
    }

    private java.sql.Timestamp answersPurgedAt(Long applicationId) {
        return jdbcTemplate.queryForObject(
                "SELECT answers_purged_at FROM application WHERE id = ?", java.sql.Timestamp.class, applicationId);
    }

    private Long applicationVersion(Long applicationId) {
        return jdbcTemplate.queryForObject("SELECT version FROM application WHERE id = ?", Long.class, applicationId);
    }

    private String recruitmentStatus(Long recruitmentId) {
        return jdbcTemplate.queryForObject("SELECT status FROM recruitment WHERE id = ?", String.class, recruitmentId);
    }

    private void assertPurged(Application application, RecruitmentFixture fixture) throws Exception {
        assertThat(answerValues(application.getId(), fixture.text().id()).get(0).asText())
                .isEqualTo(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER);
        assertThat(answerValues(application.getId(), fixture.single().id()).get(0).asText())
                .isEqualTo(fixture.singleChoiceId());
        assertThat(answerValues(application.getId(), fixture.multi().id()).size()).isEqualTo(2);
        assertThat(answersPurgedAt(application.getId())).isNotNull();
    }

    private void assertUntouched(Application application, RecruitmentFixture fixture) throws Exception {
        assertThat(answerValues(application.getId(), fixture.text().id()).get(0).asText()).isEqualTo(TEXT_ANSWER);
        assertThat(answersPurgedAt(application.getId())).isNull();
    }
}
