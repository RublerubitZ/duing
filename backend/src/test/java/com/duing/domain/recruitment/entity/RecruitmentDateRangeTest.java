package com.duing.domain.recruitment.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.ClubFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class RecruitmentDateRangeTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 10, 15);
    private static final String OUT_OF_RANGE_MESSAGE = "모집 기간은 2000-01-01부터 2100-12-31 사이여야 합니다.";

    private final Club club = ClubFixture.academic("날짜범위동아리");

    private static UpdateRecruitmentCommand updateCommand(String title, LocalDate startDate, LocalDate endDate) {
        return new UpdateRecruitmentCommand(1L, 1L, title, null, startDate, endDate,
                null, null, null, null, null, null, null);
    }

    private Recruitment periodRecruitment() {
        return Recruitment.create(club, "원래 제목", null, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 31), 10);
    }

    @Test
    @DisplayName("시작일이 2000-01-01 보다 이르면 모집을 만들 수 없다")
    void rejectsStartDateBeforeMinimumOnCreate() {
        assertThatThrownBy(() -> Recruitment.create(club, "모집", null,
                LocalDate.of(1999, 12, 31), LocalDate.of(2000, 1, 10), 10))
                .isInstanceOf(RecruitmentException.RecruitmentDateOutOfRangeException.class)
                .hasMessage(OUT_OF_RANGE_MESSAGE);
    }

    @Test
    @DisplayName("종료일이 2100-12-31 보다 늦으면 모집을 만들 수 없다")
    void rejectsEndDateAfterMaximumOnCreate() {
        assertThatThrownBy(() -> Recruitment.create(club, "모집", null,
                LocalDate.of(2100, 12, 1), LocalDate.of(2101, 1, 1), 10))
                .isInstanceOf(RecruitmentException.RecruitmentDateOutOfRangeException.class)
                .hasMessage(OUT_OF_RANGE_MESSAGE);
    }

    @Test
    @DisplayName("허용 범위의 양 끝 날짜(2000-01-01, 2100-12-31)로는 모집을 만들 수 있다")
    void acceptsBoundaryDatesOnCreate() {
        assertThatCode(() -> Recruitment.create(club, "모집", null,
                Recruitment.MIN_RECRUITMENT_DATE, Recruitment.MAX_RECRUITMENT_DATE, 10))
                .doesNotThrowAnyException();
        assertThat(Recruitment.MIN_RECRUITMENT_DATE).isEqualTo(LocalDate.of(2000, 1, 1));
        assertThat(Recruitment.MAX_RECRUITMENT_DATE).isEqualTo(LocalDate.of(2100, 12, 31));
    }

    @Test
    @DisplayName("범위 위반 안내 문구는 허용 범위 상수의 두 날짜를 그대로 보여 준다")
    void outOfRangeMessageShowsAllowedRangeConstants() {
        assertThat(new RecruitmentException.RecruitmentDateOutOfRangeException().getMessage())
                .contains(Recruitment.MIN_RECRUITMENT_DATE.toString(), Recruitment.MAX_RECRUITMENT_DATE.toString());
    }

    @Test
    @DisplayName("상시모집은 시작일만 범위를 검사한다")
    void alwaysOpenChecksOnlyStartDate() {
        assertThatThrownBy(() -> Recruitment.create(club, "상시", null, LocalDate.of(1999, 12, 31), null, 10))
                .isInstanceOf(RecruitmentException.RecruitmentDateOutOfRangeException.class);
        assertThatCode(() -> Recruitment.create(club, "상시", null, LocalDate.of(2000, 1, 1), null, 10))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("수정 요청의 날짜가 범위를 벗어나면 거부되고 같은 요청의 제목도 바뀌지 않는다")
    void rejectsOutOfRangeDatesOnUpdateWithoutPartialChange() {
        Recruitment recruitment = periodRecruitment();

        assertThatThrownBy(() -> recruitment.update(updateCommand("새 제목", LocalDate.of(1999, 12, 31), null), null))
                .isInstanceOf(RecruitmentException.RecruitmentDateOutOfRangeException.class);
        assertThat(recruitment.getTitle()).isEqualTo("원래 제목");

        assertThatThrownBy(() -> recruitment.update(updateCommand(null, null, LocalDate.of(2101, 1, 1)), null))
                .isInstanceOf(RecruitmentException.RecruitmentDateOutOfRangeException.class);
        assertThat(recruitment.getEndDate()).isEqualTo(LocalDate.of(2026, 10, 31));
    }

    @Test
    @DisplayName("범위 밖으로 저장된 레거시 모집도 같은 날짜를 다시 보내거나 날짜 없이 보내는 제목 수정은 된다")
    void legacyOutOfRangeRecruitmentAllowsUnchangedDates() {
        Recruitment recruitment = periodRecruitment();
        ReflectionTestUtils.setField(recruitment, "startDate", LocalDate.of(1, 1, 1));
        ReflectionTestUtils.setField(recruitment, "endDate", LocalDate.of(9999, 12, 31));

        recruitment.update(updateCommand("같은 날짜 재전송", LocalDate.of(1, 1, 1), LocalDate.of(9999, 12, 31)), null);
        assertThat(recruitment.getTitle()).isEqualTo("같은 날짜 재전송");

        recruitment.update(updateCommand("날짜 없는 수정", null, null), null);
        assertThat(recruitment.getTitle()).isEqualTo("날짜 없는 수정");
    }

    @Test
    @DisplayName("1년 넘게 운영한 상시모집도 접수를 마감한 뒤 미래 종료일로 다시 열 수 있다")
    void longRunningAlwaysOpenCanResumeAfterStopIntake() {
        Recruitment recruitment = Recruitment.create(club, "상시", null, TODAY.minusDays(400), null, 10);
        recruitment.stopIntake(TODAY);

        assertThatCode(() -> recruitment.update(updateCommand(null, null, TODAY.plusDays(30)), null))
                .doesNotThrowAnyException();
        assertThat(recruitment.getEndDate()).isEqualTo(TODAY.plusDays(30));
    }

    @Test
    @DisplayName("마감된 모집에 범위 밖 날짜를 보내면 이미 마감됐다는 예외가 먼저 난다")
    void closedRecruitmentReportsClosedBeforeRange() {
        Recruitment recruitment = periodRecruitment();
        recruitment.close(LocalDateTime.of(2026, 10, 15, 12, 0));

        assertThatThrownBy(() -> recruitment.update(updateCommand(null, LocalDate.of(1999, 12, 31), null), null))
                .isInstanceOf(RecruitmentException.RecruitmentAlreadyClosedException.class);
    }
}
