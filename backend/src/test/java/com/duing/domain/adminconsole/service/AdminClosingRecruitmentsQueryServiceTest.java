package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.adminconsole.controller.dto.response.AdminClosingRecruitmentsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminClosingRecruitmentsResponse.ClosingRecruitmentResponse;
import com.duing.domain.adminconsole.service.dto.query.AdminClosingRecruitmentsQuery;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminClosingRecruitmentsQueryServiceTest extends IntegrationTestBase {

    /** KST 2026-11-04(수) 14:00 — 이번 주는 11/2(월)~11/8(일), 11/2·11/3 종료는 이미 기간이 지났다. */
    private static final Clock WEDNESDAY_CLOCK = Clock.fixed(Instant.parse("2026-11-04T05:00:00Z"), ZoneId.of("Asia/Seoul"));
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 2);
    private static final LocalDate WEDNESDAY = MONDAY.plusDays(2);

    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(1);

    private AdminClosingRecruitmentsQueryService service() {
        return new AdminClosingRecruitmentsQueryService(recruitmentRepository, WEDNESDAY_CLOCK);
    }

    @Test
    @DisplayName("이번 주(서버 KST 월~일)에 기간이 끝나는 진행 중 모집을 종료일 순으로 준다 — 이미 기간이 지난 진행 중 모집도 들고, 마감·지운·주 밖·상시 모집은 빠진다")
    void returnsOpenRecruitmentsEndingThisWeek() {
        Recruitment endedMonday = saveOpen(MONDAY, ApplicationMode.SELF);
        Recruitment endsSunday = saveOpen(MONDAY.plusDays(6), ApplicationMode.SELF);
        Recruitment external = saveOpen(MONDAY.plusDays(3), ApplicationMode.EXTERNAL);
        saveOpen(MONDAY.minusDays(1), ApplicationMode.SELF);
        saveOpen(MONDAY.plusDays(7), ApplicationMode.SELF);
        saveOpen(null, ApplicationMode.SELF);
        Recruitment closed = saveOpen(MONDAY.plusDays(2), ApplicationMode.SELF);
        closed.close(MONDAY.plusDays(2).atTime(18, 0));
        recruitmentRepository.save(closed);
        recruitmentRepository.delete(saveOpen(MONDAY.plusDays(4), ApplicationMode.SELF));

        AdminClosingRecruitmentsQuery closing = service().getClosingRecruitments();

        assertThat(closing.weekStart()).isEqualTo(MONDAY);
        assertThat(closing.recruitments()).extracting(ClosingRecruitmentRow::recruitmentId)
                .containsExactly(endedMonday.getId(), external.getId(), endsSunday.getId());
        ClosingRecruitmentRow first = closing.recruitments().get(0);
        assertThat(first.title()).isEqualTo(endedMonday.getTitle());
        assertThat(first.clubName()).startsWith("마감임박동아리");
        assertThat(first.endDate()).isEqualTo(MONDAY);
        assertThat(closing.recruitments().get(1).applicationMode()).isEqualTo(ApplicationMode.EXTERNAL);
    }

    @Test
    @DisplayName("결과 안 정한 지원은 제출·보류·면접 대상만 세고 합격·불합격·철회는 뺀다 — 지원이 없으면 0 이다")
    void countsUndecidedApplications() {
        Recruitment recruitment = saveOpen(MONDAY.plusDays(1), ApplicationMode.SELF);
        Recruitment empty = saveOpen(MONDAY.plusDays(5), ApplicationMode.SELF);
        for (ApplicationStatus status : List.of(ApplicationStatus.SUBMITTED, ApplicationStatus.ON_HOLD,
                ApplicationStatus.INTERVIEW_PENDING, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED)) {
            PendingItemsFixture.saveApplication(applicationRepository, recruitment, userRepository.save(UserFixture.unique()), status);
        }
        Application withdrawn = PendingItemsFixture.saveApplication(applicationRepository, recruitment,
                userRepository.save(UserFixture.unique()), ApplicationStatus.SUBMITTED);
        applicationRepository.delete(withdrawn);

        List<ClosingRecruitmentRow> rows = service().getClosingRecruitments().recruitments();

        assertThat(rows).extracting(ClosingRecruitmentRow::recruitmentId).containsExactly(recruitment.getId(), empty.getId());
        assertThat(rows).extracting(ClosingRecruitmentRow::undecidedApplicationCount).containsExactly(3L, 0L);
    }

    @Test
    @DisplayName("줄마다 서버 오늘(KST) 기준 표시 상태를 싣는다 — 기간이 지난 진행 중 모집은 CLOSED, 오늘 진행 중은 OPEN, 아직 시작 전은 UPCOMING 이고 저장 상태는 늘 OPEN 이다")
    void resolvesDisplayStatusWithServerToday() {
        Recruitment endedMonday = saveOpen(MONDAY, ApplicationMode.SELF);
        Recruitment endsToday = saveOpen(WEDNESDAY, ApplicationMode.SELF);
        Recruitment startsFriday = saveOpen(MONDAY.plusDays(4), MONDAY.plusDays(6), ApplicationMode.SELF);

        List<ClosingRecruitmentResponse> rows =
                AdminClosingRecruitmentsResponse.from(service().getClosingRecruitments()).recruitments();

        assertThat(rows).extracting(ClosingRecruitmentResponse::recruitmentId)
                .containsExactly(endedMonday.getId(), endsToday.getId(), startsFriday.getId());
        assertThat(rows).extracting(ClosingRecruitmentResponse::status).containsOnly(RecruitmentStatus.OPEN);
        assertThat(rows).extracting(ClosingRecruitmentResponse::displayStatus).containsExactly(
                RecruitmentDisplayStatus.CLOSED, RecruitmentDisplayStatus.OPEN, RecruitmentDisplayStatus.UPCOMING);
    }

    /** 동아리당 OPEN 하나(uk_recruitment_club_active)라 모집마다 동아리를 만든다. 면접 대상 전이를 위해 면접 사용 모집이다. */
    private Recruitment saveOpen(LocalDate endDate, ApplicationMode applicationMode) {
        return saveOpen(endDate == null ? MONDAY.minusDays(20) : endDate.minusDays(10), endDate, applicationMode);
    }

    private Recruitment saveOpen(LocalDate startDate, LocalDate endDate, ApplicationMode applicationMode) {
        return recruitmentRepository.save(Recruitment.createWithOptions(
                clubRepository.save(ClubFixture.academic("마감임박동아리" + sequence.incrementAndGet())),
                "모집" + sequence.incrementAndGet(), null, startDate, endDate, 10, applicationMode,
                applicationMode == ApplicationMode.EXTERNAL ? "https://forms.gle/example" : null,
                true, TargetRole.MEMBER, null, null, false));
    }
}
