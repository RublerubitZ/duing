package com.duing.domain.user.profilecheck.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.global.time.TimeMapper;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

class ProfileCheckPolicyTest {

    private static final Semester FIRST_TERM = new Semester(2027, Semester.FIRST_TERM);
    private static final Semester SECOND_TERM = new Semester(2027, Semester.SECOND_TERM);

    // 겨울방학 경계(2027-01-01 0시 서울)를 users.created_at 과 같은 JVM 존 벽시계로 옮긴다 — JVM 존과 무관하게 경계 앞뒤를 만든다.
    private static final LocalDateTime WINTER_BREAK_START =
            TimeMapper.seoulToSystemWallClock(LocalDateTime.of(2027, 1, 1, 0, 0));
    private static final LocalDateTime BEFORE_WINTER_BREAK = WINTER_BREAK_START.minusSeconds(1);

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"FRESHMAN, SOPHOMORE", "SOPHOMORE, JUNIOR", "JUNIOR, SENIOR"})
    @DisplayName("1학기에는 1~3학년에게 다음 학년을 제안한다")
    void suggestsNextGradeInFirstTerm(Grade currentGrade, Grade expectedGrade) {
        assertThat(ProfileCheckPolicy.suggestedGrade(currentGrade, BEFORE_WINTER_BREAK, FIRST_TERM))
                .isEqualTo(expectedGrade);
    }

    @ParameterizedTest
    @EnumSource(value = Grade.class, names = {"SENIOR", "ON_LEAVE", "GRADUATED"})
    @DisplayName("1학기라도 4학년·휴학생·졸업생에게는 학년을 제안하지 않는다")
    void noSuggestionWithoutNextGrade(Grade currentGrade) {
        assertThat(ProfileCheckPolicy.suggestedGrade(currentGrade, BEFORE_WINTER_BREAK, FIRST_TERM)).isNull();
    }

    @ParameterizedTest
    @EnumSource(Grade.class)
    @DisplayName("2학기에는 학년을 제안하지 않는다 — 같은 학년도라 학년이 바뀌지 않는다")
    void noSuggestionInSecondTerm(Grade currentGrade) {
        assertThat(ProfileCheckPolicy.suggestedGrade(currentGrade, BEFORE_WINTER_BREAK, SECOND_TERM)).isNull();
    }

    @Test
    @DisplayName("그해 1월 1일(서울) 0시 이후 가입자에게는 1학기에도 제안하지 않고, 그 직전 가입자에게는 제안한다")
    void winterSignupGetsNoSuggestion() {
        assertThat(ProfileCheckPolicy.suggestedGrade(Grade.FRESHMAN, WINTER_BREAK_START, FIRST_TERM)).isNull();
        assertThat(ProfileCheckPolicy.suggestedGrade(Grade.FRESHMAN, BEFORE_WINTER_BREAK, FIRST_TERM))
                .isEqualTo(Grade.SOPHOMORE);
    }

    @Test
    @DisplayName("대상은 정지되지 않은 학생 중 졸업생이 아닌 사람이다 — 휴학생은 대상이다")
    void targetIsActiveNonGraduatedStudent() {
        User freshman = UserFixture.unique();
        User onLeave = studentWith(Grade.ON_LEAVE);
        User graduated = studentWith(Grade.GRADUATED);
        User suspended = UserFixture.unique();
        suspended.suspend();
        User admin = UserFixture.admin();

        assertThat(ProfileCheckPolicy.isTarget(freshman)).isTrue();
        assertThat(ProfileCheckPolicy.isTarget(onLeave)).isTrue();
        assertThat(ProfileCheckPolicy.isTarget(graduated)).isFalse();
        assertThat(ProfileCheckPolicy.isTarget(suspended)).isFalse();
        assertThat(ProfileCheckPolicy.isTarget(admin)).isFalse();
    }

    @Test
    @DisplayName("학년만 바꾸면 이름·단과대학·전공은 그대로다")
    void changeGradeTouchesOnlyGrade() {
        User student = UserFixture.unique();
        String nameBefore = student.getName();

        student.changeGrade(Grade.JUNIOR);

        assertThat(student.getGrade()).isEqualTo(Grade.JUNIOR);
        assertThat(student.getName()).isEqualTo(nameBefore);
        assertThat(student.getMajor()).isEqualTo("미설정");
    }

    private User studentWith(Grade grade) {
        User student = UserFixture.unique();
        student.changeGrade(grade);
        return student;
    }
}
