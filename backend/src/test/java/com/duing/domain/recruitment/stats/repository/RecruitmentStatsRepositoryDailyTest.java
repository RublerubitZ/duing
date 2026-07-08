package com.duing.domain.recruitment.stats.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import com.duing.common.TestcontainersConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class RecruitmentStatsRepositoryDailyTest {

    @Autowired RecruitmentStatsRepositoryCustom statsRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired EntityManager entityManager;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private User saveUser() {
        long seq = sequence.incrementAndGet();
        return userRepository.save(
                User.create(
                        "20" + seq,
                        "테스터" + seq,
                        "test" + seq + "@duing.ac.kr",
                        "hashed",
                        UserRole.STUDENT,
                        Grade.FRESHMAN,
                        College.IT_ENGINEERING,
                        "미설정",
                        "010-0000-0000",
                        java.time.LocalDateTime.now()
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

    private Recruitment saveRecruitment(Club club, LocalDate startDate, LocalDate endDate) {
        return recruitmentRepository.save(
                Recruitment.create(club, "2025 신입 모집", null, startDate, endDate, 10)
        );
    }

    private Application saveApplicationWithCreatedAt(Recruitment recruitment, User user, LocalDateTime createdAt)
            throws Exception {
        Application application = applicationRepository.save(
                Application.submit(recruitment, user, List.of(new ApplicationAnswer("q1", List.of("답변"))))
        );
        applicationRepository.flush();
        // @CreatedDate 가 INSERT 시 현재 시각으로 덮어쓰므로, 저장 후 native SQL 로 created_at 을 원하는 값으로 수정한다
        entityManager.createNativeQuery(
                "UPDATE application SET created_at = :createdAt WHERE id = :id")
                .setParameter("createdAt", createdAt)
                .setParameter("id", application.getId())
                .executeUpdate();
        entityManager.flush();
        return application;
    }

    @Test
    @DisplayName("같은 날 2건, 다른 날 1건, soft-delete 1건이면 daily map 에 두 날짜 키만 존재하고 카운트가 정확하며 deleted 건은 제외된다")
    void dailyMapHasCorrectCountsAndExcludesSoftDeleted() throws Exception {
        Club club = saveActiveClub();
        LocalDate startDate = LocalDate.of(2025, 5, 1);
        LocalDate endDate = LocalDate.of(2025, 5, 10);
        Recruitment recruitment = saveRecruitment(club, startDate, endDate);

        // 2025-05-01 KST 에 2건 제출 (UTC 기준 2025-04-30T15:00:00Z = KST 2025-05-01T00:00:00)
        LocalDateTime kstMay1AsUtc = LocalDateTime.of(2025, 4, 30, 15, 0, 0);
        saveApplicationWithCreatedAt(recruitment, saveUser(), kstMay1AsUtc);
        saveApplicationWithCreatedAt(recruitment, saveUser(), kstMay1AsUtc);

        // 2025-05-03 KST 에 1건 제출
        LocalDateTime kstMay3AsUtc = LocalDateTime.of(2025, 5, 2, 15, 0, 0);
        saveApplicationWithCreatedAt(recruitment, saveUser(), kstMay3AsUtc);

        // soft-delete 될 건 (2025-05-01 KST)
        Application deletedApplication = saveApplicationWithCreatedAt(recruitment, saveUser(), kstMay1AsUtc);
        applicationRepository.delete(deletedApplication);

        applicationRepository.flush();
        entityManager.clear();

        Map<LocalDate, Long> result = statsRepository.findDailySubmissionCounts(
                recruitment.getId(), startDate, endDate);

        assertThat(result).hasSize(2);
        assertThat(result.get(LocalDate.of(2025, 5, 1))).isEqualTo(2L);
        assertThat(result.get(LocalDate.of(2025, 5, 3))).isEqualTo(1L);
    }

    @Test
    @DisplayName("KST 자정 직전(UTC 14:59)에 생성된 행은 전날 KST 날짜로 카운트되어 자정 경계 버그가 발생하지 않는다")
    void kstMidnightBoundaryIsHandledCorrectly() throws Exception {
        Club club = saveActiveClub();
        LocalDate startDate = LocalDate.of(2025, 5, 1);
        LocalDate endDate = LocalDate.of(2025, 5, 5);
        Recruitment recruitment = saveRecruitment(club, startDate, endDate);

        // UTC 2025-05-01T14:59:00 = KST 2025-05-01T23:59:00 → KST 날짜는 2025-05-01
        LocalDateTime utcBeforeKstMidnight = LocalDateTime.of(2025, 5, 1, 14, 59, 0);
        saveApplicationWithCreatedAt(recruitment, saveUser(), utcBeforeKstMidnight);

        // UTC 2025-05-01T15:00:00 = KST 2025-05-02T00:00:00 → KST 날짜는 2025-05-02
        LocalDateTime utcAtKstMidnight = LocalDateTime.of(2025, 5, 1, 15, 0, 0);
        saveApplicationWithCreatedAt(recruitment, saveUser(), utcAtKstMidnight);

        applicationRepository.flush();
        entityManager.clear();

        Map<LocalDate, Long> result = statsRepository.findDailySubmissionCounts(
                recruitment.getId(), startDate, endDate);

        assertThat(result).hasSize(2);
        // UTC 14:59 는 KST 23:59 → 5월 1일
        assertThat(result.get(LocalDate.of(2025, 5, 1))).isEqualTo(1L);
        // UTC 15:00 는 KST 00:00 → 5월 2일
        assertThat(result.get(LocalDate.of(2025, 5, 2))).isEqualTo(1L);
    }
}