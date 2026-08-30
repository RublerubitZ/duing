package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 홈 관심도 정렬 점수의 합성 산식 단위 테스트.
 *
 * <p>같은 성질을 통합 테스트({@code ClubInterestMetricTest})도 지키지만 그쪽은 Postgres 컨테이너와
 * 배치 실행이 필요하다. 순수 함수의 회귀는 여기서 도커 없이 잡는다 — 특히 가중치를 만지는 사람이
 * 경계 아래로 내려 성질이 조용히 뒤집히는 것을 막는다.
 */
class ClubInterestPolicyTest {

    /** 한 사람이 창 전체(오늘 포함 7일)를 매일 본 경우의 감쇠 합. */
    private static final double ONE_PERSON_EVERY_DAY = decayedSum(0, ClubInterestPolicy.WINDOW_DAYS - 1);

    @Test
    @DisplayName("정렬 점수는 감쇠 축과 순방문자 축을 가중치대로 합성한다")
    void blendsDecayedAxisAndVisitorAxisByWeight() {
        double visitorWeight = ClubInterestPolicy.VISITOR_WEIGHT;

        // 오늘 한 명만 본 경우 두 축이 모두 1 이라 가중치와 무관하게 1 이다.
        assertThat(ClubInterestPolicy.interestScore(1.0, 1)).isCloseTo(1.0, within(1e-9));
        assertThat(ClubInterestPolicy.interestScore(4.0, 2))
                .isCloseTo((1 - visitorWeight) * 4.0 + visitorWeight * 2, within(1e-9));
        // 조회가 없으면 0 — 배치가 metric 행을 0 으로 덮는 경로와 같은 값이어야 한다.
        assertThat(ClubInterestPolicy.interestScore(0.0, 0)).isZero();
    }

    @Test
    @DisplayName("서로 다른 세 명의 오늘 조회가 한 사람의 창 전체 반복 조회를 앞선다")
    void distinctVisitorsOutweighOnePersonRepeatingAcrossTheWindow() {
        double onePersonRepeating = ClubInterestPolicy.interestScore(ONE_PERSON_EVERY_DAY, 1);
        double threeDistinctToday = ClubInterestPolicy.interestScore(3.0, 3);

        assertThat(threeDistinctToday).isGreaterThan(onePersonRepeating);
    }

    @Test
    @DisplayName("순방문자 비중이 뒤집힘 경계보다 위에 있다 — 아래로 내리면 반복 조회가 다시 이긴다")
    void visitorWeightStaysAboveTheFlipBoundary() {
        // (1-w)·S + w·1 = 3 을 w 로 풀면 경계다. S 는 한 사람이 창 전체를 본 감쇠 합.
        double flipBoundary = (ONE_PERSON_EVERY_DAY - 3.0) / (ONE_PERSON_EVERY_DAY - 1.0);

        assertThat(flipBoundary).isCloseTo(0.30688, within(1e-5));
        assertThat(ClubInterestPolicy.VISITOR_WEIGHT).isGreaterThan(flipBoundary);
    }

    @Test
    @DisplayName("창 끝 하루 조회는 같은 사람 수의 오늘 조회에 약 2배 뒤진다")
    void oldestDayInWindowIsRoughlyHalfOfToday() {
        double oldestDayWeight = Math.pow(0.5, (double) (ClubInterestPolicy.WINDOW_DAYS - 1) / ClubInterestPolicy.HALF_LIFE_DAYS);
        double today = ClubInterestPolicy.interestScore(1.0, 1);
        double oldest = ClubInterestPolicy.interestScore(oldestDayWeight, 1);

        // 감쇠만 쓰던 시절에는 4배였다 — 합성이 그 페널티를 완만하게 만든다.
        assertThat(today / oldest).isCloseTo(1.951, within(0.01));
    }

    /** {@code fromDaysAgo}~{@code toDaysAgo} 일 전 하루 한 번씩 봤을 때의 감쇠 합. */
    private static double decayedSum(int fromDaysAgo, int toDaysAgo) {
        return IntStream.rangeClosed(fromDaysAgo, toDaysAgo)
                .mapToDouble(daysAgo -> Math.pow(0.5, (double) daysAgo / ClubInterestPolicy.HALF_LIFE_DAYS))
                .sum();
    }
}
