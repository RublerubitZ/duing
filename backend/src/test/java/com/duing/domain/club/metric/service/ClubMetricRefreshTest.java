package com.duing.domain.club.metric.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.favorite.entity.ClubFavorite;
import com.duing.domain.favorite.repository.ClubFavoriteRepository;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class ClubMetricRefreshTest {

    @Autowired ClubMetricService clubMetricService;
    @Autowired ClubMetricRepository clubMetricRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubFavoriteRepository clubFavoriteRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("찜·지원·최근활동이 있는 동아리는 카운트·활동시각·양수 점수로, 신호가 없는 동아리는 0 으로 집계된다")
    void refreshComputesCountsAndNormalizedScore() throws Exception {
        Club active = saveActiveClub("metricActive");
        Club idle = saveActiveClub("metricIdle");
        Recruitment recruitment = saveOpenRecruitment(active);
        saveFavorites(active, 2);
        saveApplications(recruitment, 1);

        clubMetricService.refreshAll();

        // 점수는 전역 최댓값 정규화라 공유 테스트 DB 의 잔존 데이터(다른 클래스가 커밋한 찜·지원)에
        // 절대값이 흔들린다 — 절대값(=1.0) 특성은 ClubRecommendationPolicyTest 단위테스트가 검증하고,
        // 여기서는 잔존 데이터와 무관한 카운트·상대 비교만 단언한다.
        ClubMetric activeMetric = clubMetricRepository.findById(active.getId()).orElseThrow();
        assertThat(activeMetric.getFavoriteCount()).isEqualTo(2);
        assertThat(activeMetric.getApplicationCount()).isEqualTo(1);
        // 모집 등록(created_at=방금)이 최근활동으로 잡힌다.
        assertThat(activeMetric.getLastActivityAt()).isNotNull();
        assertThat(activeMetric.getComputedAt()).isNotNull();

        ClubMetric idleMetric = clubMetricRepository.findById(idle.getId()).orElseThrow();
        assertThat(idleMetric.getFavoriteCount()).isZero();
        assertThat(idleMetric.getApplicationCount()).isZero();
        assertThat(idleMetric.getLastActivityAt()).isNull();
        assertThat(idleMetric.getActivityScore()).isZero();
        assertThat(activeMetric.getActivityScore())
                .isGreaterThan(idleMetric.getActivityScore())
                .isLessThanOrEqualTo(1.0);
    }

    @Test
    @DisplayName("재실행하면 기존 행을 에러 없이 갱신한다(upsert) — 새 찜이 카운트에 반영된다")
    void refreshIsIdempotentUpsert() throws Exception {
        Club club = saveActiveClub("metricUpsert");
        saveFavorites(club, 1);
        clubMetricService.refreshAll();
        assertThat(clubMetricRepository.findById(club.getId()).orElseThrow().getFavoriteCount()).isEqualTo(1);

        saveFavorites(club, 2);
        clubMetricService.refreshAll();

        assertThat(clubMetricRepository.findById(club.getId()).orElseThrow().getFavoriteCount()).isEqualTo(3);
    }

    @Test
    @DisplayName("soft-delete 된 찜은 favorite_count 집계에서 제외된다")
    void softDeletedFavoritesAreExcluded() throws Exception {
        Club club = saveActiveClub("metricSoftDel");
        User user = saveUser("metricSoftDelUser");
        ClubFavorite favorite = clubFavoriteRepository.save(ClubFavorite.create(user, club));
        saveFavorites(club, 1);
        clubFavoriteRepository.delete(favorite);
        clubFavoriteRepository.flush();

        clubMetricService.refreshAll();

        assertThat(clubMetricRepository.findById(club.getId()).orElseThrow().getFavoriteCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("찜 수가 극단적으로 많아도 로그 정규화로 다른 동아리와의 점수 차가 압도적이지 않다")
    void extremeCountsAreLogNormalized() throws Exception {
        Club extreme = saveActiveClub("metricLogExtreme");
        Club modest = saveActiveClub("metricLogModest");
        saveFavorites(extreme, 30);
        saveFavorites(modest, 3);

        clubMetricService.refreshAll();

        double extremeScore = clubMetricRepository.findById(extreme.getId()).orElseThrow().getActivityScore();
        double modestScore = clubMetricRepository.findById(modest.getId()).orElseThrow().getActivityScore();
        // 두 동아리 모두 찜 성분만 있으므로 점수비 = log1p(3)/log1p(30) — 전역 최댓값이
        // 분모에서 소거되어 잔존 데이터와 무관하게 성립한다(raw 합산이면 0.1x 였을 격차).
        double expectedLogRatio = Math.log1p(3) / Math.log1p(30);
        assertThat(extremeScore).isGreaterThan(0);
        assertThat(modestScore / extremeScore).isCloseTo(expectedLogRatio, within(1e-9));
    }

    @Test
    @DisplayName("운영 중단·삭제로 집계 대상에서 빠진 동아리의 metric 행은 다음 갱신에서 제거된다")
    void orphanMetricRowsAreRemovedOnRefresh() throws Exception {
        Club staying = saveActiveClub("metricOrphanStay");
        Club deactivated = saveActiveClub("metricOrphanInactive");
        Club deleted = saveActiveClub("metricOrphanDeleted");
        clubMetricService.refreshAll();
        assertThat(clubMetricRepository.findById(deactivated.getId())).isPresent();
        assertThat(clubMetricRepository.findById(deleted.getId())).isPresent();

        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(deactivated, ClubStatus.INACTIVE);
        clubRepository.save(deactivated);
        clubRepository.delete(deleted);   // @SQLDelete soft-delete
        clubRepository.flush();

        clubMetricService.refreshAll();

        assertThat(clubMetricRepository.findById(deactivated.getId())).isEmpty();
        assertThat(clubMetricRepository.findById(deleted.getId())).isEmpty();
        assertThat(clubMetricRepository.findById(staying.getId())).isPresent();
    }

    // ── helpers ──

    private Club saveActiveClub(String name) throws Exception {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club created = Club.create(uniqueName, ClubCategory.ACADEMIC, "분과", "설명", null, false, null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(created, ClubStatus.ACTIVE);
        return clubRepository.save(created);
    }

    private Recruitment saveOpenRecruitment(Club club) {
        LocalDate today = LocalDate.now();
        return recruitmentRepository.save(
                Recruitment.create(club, "모집-" + sequence.getAndIncrement(), null,
                        today.minusDays(1), today.plusDays(7), 10));
    }

    private void saveApplications(Recruitment recruitment, int count) {
        for (int i = 0; i < count; i++) {
            User user = saveUser("metricAppUser");
            applicationRepository.save(Application.submit(recruitment, user,
                    List.of(new ApplicationAnswer("q1", List.of("answer")))));
        }
    }

    private void saveFavorites(Club club, int count) {
        for (int i = 0; i < count; i++) {
            User user = saveUser("metricFavUser");
            clubFavoriteRepository.save(ClubFavorite.create(user, club));
        }
    }

    private User saveUser(String prefix) {
        long seq = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", seq % 10_000_000_000L),
                prefix + seq,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        ));
    }
}
