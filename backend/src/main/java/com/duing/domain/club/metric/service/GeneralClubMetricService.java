package com.duing.domain.club.metric.service;

import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.metric.repository.ClubMetricSourceRow;
import com.duing.domain.club.service.ClubRecommendationPolicy;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMetricService implements ClubMetricService {

    private final ClubMetricRepository clubMetricRepository;

    /**
     * 정규화(로그 스케일 / 전체 최댓값)가 전 동아리 분포에 의존하므로 매번 전체를 재계산한다.
     * 수십~수백 동아리 규모에서 집계 1회 + saveAll 로 충분하다.
     * ponytail: 동아리 수천 건 규모가 되면 native 일괄 upsert 로 전환.
     */
    @Override
    @Transactional
    public void refreshAll() {
        // 폐쇄·중단·삭제로 집계 대상에서 빠진 동아리의 고아 행을 먼저 걷어낸다(재활성 시 낡은 점수 방지).
        clubMetricRepository.deleteOrphans();
        List<ClubMetricSourceRow> sourceRows = clubMetricRepository.findMetricSources();
        if (sourceRows.isEmpty()) {
            return;
        }
        // lastActivityAt 은 JPA auditing 이 쓴 created_at(JVM 기본 타임존, prod=UTC-naive)이다.
        // recency 비교·computed_at 저장 모두 같은 regime 을 쓴다 — seoulClock(KST 벽시계)을 섞으면
        // 비교가 +9h 부풀고 한 테이블에 두 regime 이 공존한다(감사 타임스탬프 함정 문서 참고).
        LocalDateTime now = LocalDateTime.now();
        long maxFavoriteCount = sourceRows.stream().mapToLong(ClubMetricSourceRow::getFavoriteCount).max().orElse(0);
        long maxApplicationCount = sourceRows.stream().mapToLong(ClubMetricSourceRow::getApplicationCount).max().orElse(0);

        List<ClubMetric> metrics = sourceRows.stream()
                .map(row -> ClubMetric.of(
                        row.getClubId(),
                        row.getFavoriteCount(),
                        row.getApplicationCount(),
                        row.getLastActivityAt(),
                        ClubRecommendationPolicy.activityScore(
                                row.getFavoriteCount(), maxFavoriteCount,
                                row.getApplicationCount(), maxApplicationCount,
                                row.getLastActivityAt(), now),
                        now))
                .toList();
        clubMetricRepository.saveAll(metrics);
    }
}
