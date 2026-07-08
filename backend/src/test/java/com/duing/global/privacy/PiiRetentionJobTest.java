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
import com.duing.domain.user.entity.EmailVerification;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.EmailVerificationRepository;
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
    @Autowired EmailVerificationRepository emailVerificationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired Clock clock;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("보관기간을 넘긴 soft-delete 사용자는 PII 가 비식별화되고 anonymized_at 이 기록된다")
    void anonymizesExpiredSoftDeletedUser() {
        User user = saveUser("expired@daegu.ac.kr");
        softDeleteDaysAgo("users", user.getId(), 400); // 1년(window) 초과

        job.run();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT name, email, student_id, phone, password_hash, major, anonymized_at FROM users WHERE id = ?",
                user.getId());
        assertThat(row.get("name")).isEqualTo("탈퇴회원");
        assertThat(row.get("email")).isEqualTo("deleted+" + user.getId() + "@anonymized.invalid");
        assertThat(row.get("student_id")).isEqualTo("anon_" + user.getId());
        assertThat(row.get("phone")).isEqualTo("010-0000-0000");
        assertThat(row.get("password_hash")).isEqualTo("");
        assertThat(row.get("anonymized_at")).isNotNull();
    }

    @Test
    @DisplayName("보관기간 내(최근) soft-delete 사용자는 비식별화되지 않는다")
    void keepsRecentlyDeletedUser() {
        User user = saveUser("recent@daegu.ac.kr");
        softDeleteDaysAgo("users", user.getId(), 10);

        job.run();

        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT email, anonymized_at FROM users WHERE id = ?", user.getId());
        assertThat(row.get("email")).isEqualTo("recent@daegu.ac.kr");
        assertThat(row.get("anonymized_at")).isNull();
    }

    @Test
    @DisplayName("이미 익명화된 행은 재실행해도 다시 변형되지 않는다 (멱등)")
    void isIdempotentForAlreadyAnonymized() {
        User user = saveUser("idem@daegu.ac.kr");
        softDeleteDaysAgo("users", user.getId(), 400);

        job.run();
        String firstEmail = userEmail(user.getId());
        job.run();
        String secondEmail = userEmail(user.getId());

        assertThat(secondEmail).isEqualTo(firstEmail); // anonymized_at 가드로 이중 변형 없음
    }

    @Test
    @DisplayName("활성(미삭제) 사용자는 보관기간과 무관하게 절대 비식별화되지 않는다")
    void neverTouchesActiveUser() {
        User user = saveUser("active@daegu.ac.kr");
        // soft-delete 하지 않음 (deleted_at IS NULL)

        job.run();

        assertThat(userEmail(user.getId())).isEqualTo("active@daegu.ac.kr");
    }

    @Test
    @DisplayName("비활성(enabled=false) 잡은 보관기간 초과 행도 건드리지 않는다")
    void noopWhenDisabled() {
        User user = saveUser("disabled@daegu.ac.kr");
        softDeleteDaysAgo("users", user.getId(), 400);

        PiiRetentionJob disabledJob = new PiiRetentionJob(
                new RetentionProperties(false, Period.ofYears(1)),
                clock, userRepository, applicationRepository, emailVerificationRepository);
        disabledJob.run();

        assertThat(userEmail(user.getId())).isEqualTo("disabled@daegu.ac.kr");
    }

    @Test
    @DisplayName("보관기간이 0/음수로 잘못 설정되면 활성 상태여도 만료 행을 건드리지 않는다 (오설정 안전장치)")
    void noopWhenWindowNonPositive() {
        User user = saveUser("badwindow@daegu.ac.kr");
        softDeleteDaysAgo("users", user.getId(), 400);

        PiiRetentionJob zeroWindowJob = new PiiRetentionJob(
                new RetentionProperties(true, Period.ZERO),
                clock, userRepository, applicationRepository, emailVerificationRepository);
        zeroWindowJob.run();

        assertThat(userEmail(user.getId())).isEqualTo("badwindow@daegu.ac.kr");
    }

    @Test
    @DisplayName("보관기간을 넘긴 soft-delete 지원서의 답변(jsonb)은 비워진다")
    void scrubsExpiredApplicationAnswers() throws Exception {
        Club club = saveActiveClub("보관동아리");
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(
                club, "보관모집", null, LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        User applicant = saveUser("applicant@daegu.ac.kr");
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
    @DisplayName("보관기간을 넘긴 email_verifications 행은 물리 삭제된다")
    void deletesExpiredEmailVerifications() {
        EmailVerification verification = emailVerificationRepository.save(
                EmailVerification.issue("oldcode@daegu.ac.kr", "x".repeat(64), LocalDateTime.now()));
        jdbcTemplate.update(
                "UPDATE email_verifications SET created_at = NOW() - (400 * INTERVAL '1 day') WHERE id = ?",
                verification.getId());

        job.run();

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM email_verifications WHERE id = ?", Integer.class, verification.getId());
        assertThat(count).isZero();
    }

    private String userEmail(Long id) {
        return jdbcTemplate.queryForObject("SELECT email FROM users WHERE id = ?", String.class, id);
    }

    private User saveUser(String email) {
        long seq = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                "보관테스터", email, "hashed", UserRole.STUDENT,
                Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터정보공학부",
                "010-" + String.format("%04d", seq % 10000) + "-0000", LocalDateTime.now()));
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
