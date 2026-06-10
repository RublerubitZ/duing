package com.duing.domain.interview.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewScheduleFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link InterviewScheduleRepository#findAssignedBetween(LocalDateTime, LocalDateTime)} 동작 검증.
 *
 * <p>Reminder Job (Legacy Removal Task 2) 가 "면접 24h 전 알림" 을 보내기 위해 사용하는 윈도 조회.
 * 슬롯의 {@code startTime} 이 [start, end] 범위 안이면서 schedule.status = ASSIGNED 인 것만
 * 반환해야 cancelled 또는 다른 시각의 schedule 이 잘못 알림 대상에 포함되지 않는다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class InterviewScheduleRepositoryTest {

    @Autowired InterviewScheduleRepository scheduleRepository;
    @Autowired InterviewSlotRepository slotRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("면접 24시간 전 리마인더 윈도에 해당하는 ASSIGNED 배정만 반환되고, 취소되거나 윈도 밖 배정은 제외된다")
    void findAssignedBetween_filtersByStatusAndWindow() {
        LocalDateTime now = LocalDateTime.of(2026, 6, 11, 0, 0);
        LocalDateTime windowStart = now.plusHours(23);
        LocalDateTime windowEnd = now.plusHours(25);

        Recruitment recruitment = persistOpenRecruitment("리마인더윈도");

        // 윈도 안 + ASSIGNED → 반환
        InterviewSchedule inWindowAssigned = persistSchedule(recruitment, now.plusHours(24),
                InterviewScheduleStatus.ASSIGNED);
        // 윈도 밖 + ASSIGNED → 제외
        persistSchedule(recruitment, now.plusHours(48), InterviewScheduleStatus.ASSIGNED);
        // 윈도 안 + CANCELLED → 제외
        persistSchedule(recruitment, now.plusHours(24), InterviewScheduleStatus.CANCELLED);

        List<InterviewSchedule> result = scheduleRepository.findAssignedBetween(windowStart, windowEnd);

        assertThat(result)
                .extracting(InterviewSchedule::getId)
                .containsExactly(inWindowAssigned.getId());
    }

    @Test
    @DisplayName("BETWEEN 윈도 양 끝 경계의 ASSIGNED 배정도 inclusive 로 반환된다")
    void findAssignedBetween_inclusiveBoundary() {
        LocalDateTime windowStart = LocalDateTime.of(2026, 6, 11, 23, 0);
        LocalDateTime windowEnd = LocalDateTime.of(2026, 6, 12, 1, 0);

        Recruitment recruitment = persistOpenRecruitment("경계값");

        InterviewSchedule atStart = persistSchedule(recruitment, windowStart,
                InterviewScheduleStatus.ASSIGNED);
        InterviewSchedule atEnd = persistSchedule(recruitment, windowEnd,
                InterviewScheduleStatus.ASSIGNED);

        List<InterviewSchedule> result = scheduleRepository.findAssignedBetween(windowStart, windowEnd);

        assertThat(result).extracting(InterviewSchedule::getId)
                .containsExactlyInAnyOrder(atStart.getId(), atEnd.getId());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────────

    private InterviewSchedule persistSchedule(Recruitment recruitment, LocalDateTime slotStartTime,
                                              InterviewScheduleStatus status) {
        InterviewSlot slot = slotRepository.save(
                InterviewSlotFixture.create(recruitment.getId(), slotStartTime, 5));
        Application application = persistApplication(recruitment, persistStudent("지원자"));
        InterviewSchedule schedule = InterviewScheduleFixture.assigned(
                application.getId(), slot.getId(), recruitment.getId());
        if (status == InterviewScheduleStatus.CANCELLED) {
            schedule.cancel();
        }
        InterviewSchedule persisted = scheduleRepository.save(schedule);
        scheduleRepository.flush();
        return persisted;
    }

    private User persistStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "schedrepo" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club persistActiveClub(String label) {
        Club club = Club.create(
                "면접동아리-" + label + "-" + sequence.incrementAndGet(),
                ClubCategory.OTHER,
                "분과",
                "설명",
                null);
        try {
            Field statusField = Club.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(club, ClubStatus.ACTIVE);
        } catch (ReflectiveOperationException reflectionFailure) {
            throw new IllegalStateException(reflectionFailure);
        }
        return clubRepository.save(club);
    }

    private Recruitment persistOpenRecruitment(String label) {
        Club club = persistActiveClub(label);
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(
                        club,
                        "면접모집-" + label + "-" + sequence.incrementAndGet(),
                        null,
                        today.minusDays(1),
                        today.plusDays(7),
                        10));
    }

    private Application persistApplication(Recruitment recruitment, User applicant) {
        return applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
    }
}
