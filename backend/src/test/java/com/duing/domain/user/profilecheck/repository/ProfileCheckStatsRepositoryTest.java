package com.duing.domain.user.profilecheck.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.ProfileCheckConfirmation;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.domain.user.repository.UserRepository;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ProfileCheckStatsRepositoryTest extends IntegrationTestBase {

    private static final Semester THIS_SEMESTER = new Semester(2026, Semester.FIRST_TERM);
    private static final Semester LAST_SEMESTER = new Semester(2025, Semester.SECOND_TERM);

    @Autowired
    private ProfileCheckStatsRepositoryCustom statsRepository;

    @Autowired
    private ProfileCheckConfirmationRepository confirmationRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    @DisplayName("대상은 운영진·졸업생·정지·탈퇴를 뺀 학생이고, 확인 완료는 그중 해당 학기 기록이 있는 사람만 센다")
    void countsOnlyTargetsAndThisSemester() {
        User confirmedSophomore = saveStudent(Grade.SOPHOMORE);
        saveStudent(Grade.ON_LEAVE); // 대상이지만 이 학기 기록이 없다(미확인)
        User confirmedLastSemesterOnly = saveStudent(Grade.JUNIOR);
        User graduated = saveStudent(Grade.GRADUATED);
        User suspended = UserFixture.unique();
        suspended.suspend();
        suspended = userRepository.save(suspended);
        User withdrawn = saveStudent(Grade.SENIOR);
        User admin = userRepository.save(UserFixture.admin());

        confirm(confirmedSophomore, THIS_SEMESTER);
        confirm(confirmedLastSemesterOnly, LAST_SEMESTER);
        // 대상 밖 사용자의 이 학기 기록은 확인 완료에 섞이지 않아야 한다.
        confirm(graduated, THIS_SEMESTER);
        confirm(suspended, THIS_SEMESTER);
        confirm(admin, THIS_SEMESTER);
        confirm(withdrawn, THIS_SEMESTER);
        userRepository.delete(withdrawn);

        ProfileCheckCounts counts = statsRepository.countTargetsAndConfirmed(THIS_SEMESTER);

        // 대상 = 2학년(이 학기 확인), 휴학생(미확인), 3학년(지난 학기만 확인 → 이 학기 미확인)
        assertThat(counts.targetCount()).isEqualTo(3);
        assertThat(counts.confirmedCount()).isEqualTo(1);
        assertThat(counts.unconfirmedCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("지난 학기 기준으로 세면 그 학기 기록만 확인 완료로 센다")
    void countsBySemesterGiven() {
        User confirmedLastSemester = saveStudent(Grade.JUNIOR);
        User confirmedThisSemester = saveStudent(Grade.SOPHOMORE);
        confirm(confirmedLastSemester, LAST_SEMESTER);
        confirm(confirmedThisSemester, THIS_SEMESTER);

        ProfileCheckCounts counts = statsRepository.countTargetsAndConfirmed(LAST_SEMESTER);

        assertThat(counts.targetCount()).isEqualTo(2);
        assertThat(counts.confirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("같은 해 다른 학기나 다른 해 같은 학기의 기록은 이번 학기 확인으로 세지 않는다")
    void doesNotCountSemesterSharingOnlyYearOrTerm() {
        User confirmedOtherSemestersOnly = saveStudent(Grade.SOPHOMORE);
        User confirmedThisSemester = saveStudent(Grade.JUNIOR);
        // 두 기록은 이번 학기(2026-1)와 연도·학기 중 하나만 다르다 — 조인 조건 하나가 빠지면 확인 완료로 섞인다.
        confirm(confirmedOtherSemestersOnly, new Semester(2026, Semester.SECOND_TERM));
        confirm(confirmedOtherSemestersOnly, new Semester(2025, Semester.FIRST_TERM));
        confirm(confirmedThisSemester, THIS_SEMESTER);

        ProfileCheckCounts counts = statsRepository.countTargetsAndConfirmed(THIS_SEMESTER);

        assertThat(counts.targetCount()).isEqualTo(2);
        assertThat(counts.confirmedCount()).isEqualTo(1);
        assertThat(counts.unconfirmedCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("대상자가 없으면 대상·확인 완료·미확인이 모두 0 이다")
    void zeroWhenNoTargets() {
        userRepository.save(UserFixture.admin());

        ProfileCheckCounts counts = statsRepository.countTargetsAndConfirmed(THIS_SEMESTER);

        assertThat(counts.targetCount()).isZero();
        assertThat(counts.confirmedCount()).isZero();
        assertThat(counts.unconfirmedCount()).isZero();
    }

    private User saveStudent(Grade grade) {
        User student = UserFixture.unique();
        student.updateProfile(student.getName(), grade, null, null, UserFixture.PAST_GRADE_CHANGE);
        return userRepository.save(student);
    }

    private void confirm(User user, Semester semester) {
        confirmationRepository.save(ProfileCheckConfirmation.of(user.getId(), semester, Instant.parse("2026-03-02T00:00:00Z")));
    }
}
