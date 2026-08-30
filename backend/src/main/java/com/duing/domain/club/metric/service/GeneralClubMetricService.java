package com.duing.domain.club.metric.service;

import com.duing.domain.club.metric.entity.ClubMetric;
import com.duing.domain.club.metric.repository.ClubInterestSourceRow;
import com.duing.domain.club.metric.repository.ClubMetricRepository;
import com.duing.domain.club.metric.repository.ClubMetricSourceRow;
import com.duing.domain.club.metric.repository.ClubViewEventRepository;
import com.duing.domain.club.service.ClubInterestPolicy;
import com.duing.domain.club.service.ClubRecommendationPolicy;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubMetricService implements ClubMetricService {

    private final ClubMetricRepository clubMetricRepository;
    private final ClubViewEventRepository clubViewEventRepository;
    // 관심도 창·보존 경계는 KST 날짜(event_date 를 쓴 쪽과 같은 기준)로 판단한다 — seoulClock.
    private final Clock clock;

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
        // 보존 기간이 지난 관심도 원천 이벤트도 이 주기에 함께 정리한다 — 별도 잡을 두지 않는다.
        // (전용 PiiRetentionJob 이 있지만 기본 비활성이라, 거기 두면 보존이 사실상 돌지 않는다.)
        // 집계 쿼리가 이미 창으로 거르므로 삭제 순서는 결과에 영향이 없다 — 한 트랜잭션 안에서
        // 지우는 편이 잡이 중간에 죽었을 때 반쯤 정리된 상태를 남기지 않아 먼저 둔다.
        LocalDate today = LocalDate.now(clock);
        // 오늘 포함 RETENTION_DAYS 일치를 남긴다 — cutoff 는 남길 가장 오래된 날짜다.
        clubViewEventRepository.deleteOlderThan(today.minusDays(ClubInterestPolicy.RETENTION_DAYS - 1L));

        List<ClubMetricSourceRow> sourceRows = clubMetricRepository.findMetricSources();
        if (sourceRows.isEmpty()) {
            return;
        }
        // lastActivityAt 은 JPA auditing 이 쓴 created_at(JVM 기본 타임존, prod=UTC-naive)이다.
        // recency 비교·computed_at 저장 모두 같은 regime 을 쓴다 — seoulClock(KST 벽시계)을 섞으면
        // 비교가 +9h 부풀고 한 테이블에 두 regime 이 공존한다(감사 타임스탬프 함정 문서 참고).
        // 위 today(KST 날짜)는 이 regime 과 무관하다 — event_date 를 쓴 쪽과 같은 KST 날짜 축이며,
        // 두 축은 서로 비교되지 않으므로 공존해도 어긋나지 않는다.
        LocalDateTime now = LocalDateTime.now();
        long maxFavoriteCount = sourceRows.stream().mapToLong(ClubMetricSourceRow::getFavoriteCount).max().orElse(0);
        long maxApplicationCount = sourceRows.stream().mapToLong(ClubMetricSourceRow::getApplicationCount).max().orElse(0);

        // 창 안에 조회 이력이 없는 동아리는 이 맵에 아예 없다 → 아래에서 0 으로 떨어진다.
        // 지난 주에 인기였다가 이번 주 조회가 끊긴 동아리의 점수가 옛 값으로 남지 않게 하는 지점이다.
        Map<Long, ClubInterestSourceRow> interestByClubId = clubViewEventRepository.aggregateInterest(
                        today.minusDays(ClubInterestPolicy.WINDOW_DAYS - 1L),
                        today,
                        ClubInterestPolicy.HALF_LIFE_DAYS)
                .stream()
                .collect(Collectors.toMap(ClubInterestSourceRow::getClubId, Function.identity()));

        List<ClubMetric> metrics = sourceRows.stream()
                .map(row -> {
                    ClubInterestSourceRow interest = interestByClubId.get(row.getClubId());
                    return ClubMetric.of(
                            row.getClubId(),
                            row.getFavoriteCount(),
                            row.getApplicationCount(),
                            row.getLastActivityAt(),
                            ClubRecommendationPolicy.activityScore(
                                    row.getFavoriteCount(), maxFavoriteCount,
                                    row.getApplicationCount(), maxApplicationCount,
                                    row.getLastActivityAt(), now),
                            interest == null ? 0.0 : ClubInterestPolicy.interestScore(
                                    interest.getDecayedVisitScore(), interest.getWeeklyVisitorCount()),
                            interest == null ? 0 : interest.getWeeklyVisitorCount(),
                            now);
                })
                .toList();
        clubMetricRepository.saveAll(metrics);
    }
}
