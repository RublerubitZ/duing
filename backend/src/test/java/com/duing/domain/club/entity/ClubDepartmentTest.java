package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.user.entity.College;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubDepartmentTest {

    private Club departmentClub() {
        return Club.create("회계연구회", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, "회계학과");
    }

    private Club.UpdatePayload departmentPayload(String department) {
        return payload(null, department);
    }

    private Club.UpdatePayload payload(Boolean clearCollege, String department) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null,
                null, null, null, clearCollege, null, null, null, null, department);
    }

    @Test
    @DisplayName("단과대 동아리는 단과대학과 학과를 함께 저장한다")
    void createsWithCollegeAndDepartment() {
        Club club = departmentClub();

        assertThat(club.isCentralClub()).isFalse();
        assertThat(club.getCollege()).isEqualTo(College.GLOBAL_BUSINESS);
        assertThat(club.getDepartment()).isEqualTo("회계학과");
    }

    @Test
    @DisplayName("학과 없이도 단과대 동아리를 만들 수 있다")
    void createsWithoutDepartment() {
        Club club = Club.create("경영동아리", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, null);

        assertThat(club.getDepartment()).isNull();
    }

    @Test
    @DisplayName("학과는 앞뒤 공백을 떨어낸 값으로 저장되고, 공백만 있으면 미지정(null)이 된다")
    void departmentIsTrimmed() {
        Club spaced = Club.create("동아리A", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, "  회계학과  ");
        Club blank = Club.create("동아리B", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, "   ");

        assertThat(spaced.getDepartment()).isEqualTo("회계학과");
        assertThat(blank.getDepartment()).isNull();
    }

    @Test
    @DisplayName("문서에서 붙여넣은 NBSP 만 남은 학과는 미지정으로 저장된다")
    void departmentWithOnlyNonBreakingSpaceBecomesNull() {
        String nbsp = "\u00A0";   // 문서 붙여넣기로 흔히 섞여 들어오는 비분리 공백
        Club onlyNbsp = Club.create("동아리C", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, nbsp + nbsp);
        Club paddedNbsp = Club.create("동아리D", ClubCategory.ACADEMIC, null, "소개", null,
                false, College.GLOBAL_BUSINESS, nbsp + "회계학과" + nbsp);

        assertThat(onlyNbsp.getDepartment()).isNull();
        assertThat(paddedNbsp.getDepartment()).isEqualTo("회계학과");
    }

    @Test
    @DisplayName("학과는 null 이면 미변경, 빈 문자열이면 null 로 비워진다")
    void updatesDepartmentPartially() {
        Club club = departmentClub();

        club.update(departmentPayload(null));
        assertThat(club.getDepartment()).isEqualTo("회계학과");

        club.update(departmentPayload("세무학과"));
        assertThat(club.getDepartment()).isEqualTo("세무학과");

        club.update(departmentPayload(""));
        assertThat(club.getDepartment()).isNull();
    }

    @Test
    @DisplayName("단과대 동아리의 단과대학은 비울 수 없다")
    void rejectsClearingCollegeOnNonCentralClub() {
        Club club = departmentClub();

        assertThatThrownBy(() -> club.update(payload(true, null)))
                .isInstanceOf(ClubException.CollegeRequiredException.class);
        assertThat(club.getCollege()).isEqualTo(College.GLOBAL_BUSINESS);
    }

    @Test
    @DisplayName("중앙동아리는 단과대학을 비울 수 있다")
    void allowsClearingCollegeOnCentralClub() {
        Club club = Club.create("중앙동아리", ClubCategory.ACADEMIC, "학술", "소개", null,
                true, College.GLOBAL_BUSINESS, null);

        club.update(payload(true, null));

        assertThat(club.getCollege()).isNull();
    }

    @Test
    @DisplayName("중앙동아리로 전환해도 단과대학·학과 값은 지워지지 않아 되돌리면 그대로 살아난다")
    void keepsAffiliationAcrossCentralClubToggle() {
        Club club = departmentClub();

        club.changeCentralClub(true);
        assertThat(club.getCollege()).isEqualTo(College.GLOBAL_BUSINESS);
        assertThat(club.getDepartment()).isEqualTo("회계학과");

        club.changeCentralClub(false);
        assertThat(club.getCollege()).isEqualTo(College.GLOBAL_BUSINESS);
        assertThat(club.getDepartment()).isEqualTo("회계학과");
    }
}
