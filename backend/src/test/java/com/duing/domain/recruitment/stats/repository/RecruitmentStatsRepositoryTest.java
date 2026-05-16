package com.duing.domain.recruitment.stats.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
@DirtiesContext
class RecruitmentStatsRepositoryTest {

    @Autowired RecruitmentStatsRepositoryCustom statsRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(
                User.create(
                        "20" + seq,
                        "테스터" + seq,
                        "test" + seq + "@duing.ac.kr",
                        "hashed",
                        UserRole.STUDENT
                )
        );
    }

    private Club saveActiveClub() throws Exception {
        long seq = sequence.incrementAndGet();
        Club club = Club.create("동아리" + seq, ClubCategory.SPORTS, "체육", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveRecruitment(Club club) {
        return recruitmentRepository.save(
                Recruitment.create(club, "2025 신입 모집", null,
                        LocalDate.now().minusDays(5), LocalDate.now().plusDays(10), 10)
        );
    }

    private Application saveApplicationWithStatus(Recruitment recruitment, User user,
                                                   ApplicationStatus status) throws Exception {
        Application application = Application.submit(recruitment, user, List.of("답변"));
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application);
    }

    @Test
    @DisplayName("상태별 GROUP BY 가 정확히 매핑된다 — SUBMITTED=3, UNDER_REVIEW=2, ACCEPTED=1 이면 각 키·값이 일치한다")
    void statusGroupByMapsCorrectly() throws Exception {
        Club club = saveActiveClub();
        Recruitment recruitment = saveRecruitment(club);

        for (int i = 0; i < 3; i++) {
            saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.SUBMITTED);
        }
        for (int i = 0; i < 2; i++) {
            saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.UNDER_REVIEW);
        }
        saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.ACCEPTED);

        applicationRepository.flush();

        Map<ApplicationStatus, Long> result = statsRepository.findSummaryByRecruitmentId(recruitment.getId());

        assertThat(result.get(ApplicationStatus.SUBMITTED)).isEqualTo(3L);
        assertThat(result.get(ApplicationStatus.UNDER_REVIEW)).isEqualTo(2L);
        assertThat(result.get(ApplicationStatus.ACCEPTED)).isEqualTo(1L);
    }

    @Test
    @DisplayName("soft-delete 된 application 은 집계에서 제외된다 — live 2건 + deleted 3건이면 합계가 2이다")
    void softDeletedApplicationsAreExcludedFromAggregate() throws Exception {
        Club club = saveActiveClub();
        Recruitment recruitment = saveRecruitment(club);

        Application liveApplication1 = saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.SUBMITTED);
        Application liveApplication2 = saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.SUBMITTED);

        for (int i = 0; i < 3; i++) {
            Application deletedApplication = saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.SUBMITTED);
            applicationRepository.delete(deletedApplication);
        }

        applicationRepository.flush();

        Map<ApplicationStatus, Long> result = statsRepository.findSummaryByRecruitmentId(recruitment.getId());

        long total = result.values().stream().mapToLong(Long::longValue).sum();
        assertThat(total).isEqualTo(2L);
        assertThat(result.get(ApplicationStatus.SUBMITTED)).isEqualTo(2L);
    }

    @Test
    @DisplayName("결과에 없는 상태(REJECTED 0건)는 Map 에 키가 존재하지 않거나 값이 0이어서 zero-fill 서비스와 호환된다")
    void absentStatusKeyIsNotPresentOrZeroForZeroFillCompatibility() throws Exception {
        Club club = saveActiveClub();
        Recruitment recruitment = saveRecruitment(club);

        saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.SUBMITTED);
        saveApplicationWithStatus(recruitment, saveUser(), ApplicationStatus.ACCEPTED);

        applicationRepository.flush();

        Map<ApplicationStatus, Long> result = statsRepository.findSummaryByRecruitmentId(recruitment.getId());

        long rejectedCount = result.getOrDefault(ApplicationStatus.REJECTED, 0L);
        assertThat(rejectedCount).isEqualTo(0L);

        assertThat(result.get(ApplicationStatus.SUBMITTED)).isEqualTo(1L);
        assertThat(result.get(ApplicationStatus.ACCEPTED)).isEqualTo(1L);
    }
}