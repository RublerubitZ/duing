package com.duing.domain.interview.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewAvailabilityFixture;
import com.duing.common.fixture.InterviewSlotFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.interview.entity.InterviewAvailability;
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
 * {@link InterviewAvailabilityRepository#countBySlotId(Long)} 동작 검증.
 *
 * <p>Slot Lifecycle 정책 (Task C): 슬롯에 묶인 활성 availability 개수를 정확히 세어야
 * 운영진의 슬롯 수정/삭제 가드 (Task D) 가 "지원자가 선택한 슬롯" 여부를 판정할 수 있다.
 *
 * <p>엔티티의 {@code @SQLRestriction("deleted_at IS NULL")} 가 자동 적용되어
 * soft-delete 된 행은 카운트에서 자연스럽게 제외된다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class InterviewAvailabilityRepositoryTest {

    @Autowired InterviewAvailabilityRepository availabilityRepository;
    @Autowired InterviewSlotRepository slotRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("같은 슬롯에 묶인 활성 availability 3건이 있으면 카운트가 3을 반환한다")
    void countBySlotIdReturnsActiveRowCount() {
        Recruitment recruitment = persistOpenRecruitment("다수카운트");
        InterviewSlot slot = persistSlot(recruitment.getId());

        Application applicant1 = persistApplication(recruitment, persistStudent("지원자1"));
        Application applicant2 = persistApplication(recruitment, persistStudent("지원자2"));
        Application applicant3 = persistApplication(recruitment, persistStudent("지원자3"));

        availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant1.getId(), slot.getId(), recruitment.getId()));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant2.getId(), slot.getId(), recruitment.getId()));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant3.getId(), slot.getId(), recruitment.getId()));
        availabilityRepository.flush();

        long count = availabilityRepository.countBySlotId(slot.getId());

        assertThat(count).isEqualTo(3);
    }

    @Test
    @DisplayName("soft-delete 된 availability 는 카운트에서 제외된다 — 2건 중 1건 삭제 시 카운트는 1이다")
    void countBySlotIdExcludesSoftDeletedRows() {
        Recruitment recruitment = persistOpenRecruitment("소프트삭제제외");
        InterviewSlot slot = persistSlot(recruitment.getId());

        Application applicant1 = persistApplication(recruitment, persistStudent("지원자A"));
        Application applicant2 = persistApplication(recruitment, persistStudent("지원자B"));

        availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant1.getId(), slot.getId(), recruitment.getId()));
        InterviewAvailability deletedAvailability = availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant2.getId(), slot.getId(), recruitment.getId()));
        availabilityRepository.flush();

        availabilityRepository.delete(deletedAvailability); // @SQLDelete → deleted_at 세팅
        availabilityRepository.flush();

        long count = availabilityRepository.countBySlotId(slot.getId());

        assertThat(count).isEqualTo(1);
    }

    @Test
    @DisplayName("다른 슬롯에 묶인 availability 만 존재하면 대상 슬롯의 카운트는 0이다")
    void countBySlotIdReturnsZeroForUnrelatedSlot() {
        Recruitment recruitment = persistOpenRecruitment("타슬롯격리");
        InterviewSlot targetSlot = persistSlot(recruitment.getId());
        InterviewSlot otherSlot = persistSlot(recruitment.getId());

        Application applicant = persistApplication(recruitment, persistStudent("지원자X"));
        availabilityRepository.save(
                InterviewAvailabilityFixture.link(applicant.getId(), otherSlot.getId(), recruitment.getId()));
        availabilityRepository.flush();

        long count = availabilityRepository.countBySlotId(targetSlot.getId());

        assertThat(count).isZero();
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────────

    private User persistStudent(String nameSuffix) {
        long unique = sequence.incrementAndGet();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                nameSuffix + unique,
                "availrepo" + unique + "@daegu.ac.kr",
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

    private InterviewSlot persistSlot(Long recruitmentId) {
        return slotRepository.save(
                InterviewSlotFixture.create(recruitmentId, LocalDateTime.now().plusDays(10), 5));
    }

    private Application persistApplication(Recruitment recruitment, User applicant) {
        return applicationRepository.save(
                Application.submit(recruitment, applicant, List.of("답변")));
    }
}
