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
import com.duing.domain.recruitment.entity.Recruitment;
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
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;

    /** 관리자 메모는 자유서술 칸이라 실제로 이름·번호가 적힌다 — 익명화 여부를 이 값으로 판정한다. */
    private static final String ADMIN_NOTE = "본인확인 완료 — 김도윤 010-1234-5678";

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
                new RetentionProperties(false, Period.ofYears(1)),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
        disabledJob.run();

        assertThat(userAnonymizedAt(user.getId())).isNull();
    }

    @Test
    @DisplayName("보관기간이 0/음수로 잘못 설정되면 활성 상태여도 만료 행을 건드리지 않는다 (오설정 안전장치)")
    void noopWhenWindowNonPositive() {
        User user = saveUser();
        softDeleteDaysAgo("users", user.getId(), 400);

        PiiRetentionJob zeroWindowJob = new PiiRetentionJob(
                new RetentionProperties(true, Period.ZERO),
                clock, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository);
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
}
