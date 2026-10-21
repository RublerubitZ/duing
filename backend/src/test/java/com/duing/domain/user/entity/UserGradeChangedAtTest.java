package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.fixture.UserFixture;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserGradeChangedAtTest {

    private static final Instant NOW = Instant.parse("2027-01-10T03:00:00Z");

    @Test
    @DisplayName("프로필 저장으로 학년이 바뀌면 그 시각을 남기고, 같은 학년이나 학년 없이 저장하면 남기지 않는다")
    void updateProfileRecordsOnlyRealGradeChange() {
        User student = UserFixture.unique(); // FRESHMAN

        student.updateProfile(student.getName(), Grade.FRESHMAN, null, null, NOW);
        assertThat(student.getGradeChangedAt()).isNull();
        student.updateProfile(student.getName(), null, null, "바꾼 전공", NOW);
        assertThat(student.getGradeChangedAt()).isNull();

        student.updateProfile(student.getName(), Grade.SOPHOMORE, null, null, NOW);
        assertThat(student.getGrade()).isEqualTo(Grade.SOPHOMORE);
        assertThat(student.getGradeChangedAt()).isEqualTo(NOW);
    }

    @Test
    @DisplayName("팝업 확인의 학년 올림은 학년이 바뀔 때 그 시각을 남기고, 같은 학년이면 남기지 않는다")
    void changeGradeRecordsOnlyRealGradeChange() {
        User student = UserFixture.unique(); // FRESHMAN

        student.changeGrade(Grade.FRESHMAN, NOW);
        assertThat(student.getGradeChangedAt()).isNull();

        student.changeGrade(Grade.SOPHOMORE, NOW);
        assertThat(student.getGrade()).isEqualTo(Grade.SOPHOMORE);
        assertThat(student.getGradeChangedAt()).isEqualTo(NOW);
    }
}
