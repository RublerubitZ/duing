package com.duing.domain.promotion.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.promotion.entity.Promotion;
import java.time.Clock;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class PromotionRepositoryImplTest {

    @Autowired PromotionRepository promotionRepository;
    // 노출 판정과 같은 기준(seoulClock)으로 시드해야 한다 — raw now() 는 CI(UTC JVM)에서 +9h 어긋난다.
    @Autowired Clock clock;

    @Test
    @DisplayName("공개 프로모션 노출 시작·종료는 KST 벽시계 기준으로 판정된다")
    void publicActiveWindowIsJudgedInKst() {
        LocalDateTime seoulNow = LocalDateTime.now(clock);
        // 구코드(무클럭 now, CI=UTC 벽시계)라면 시작 5분 전 조건이 -9h 로 어긋나 '아직 미노출'로 잘못 판정된다.
        Promotion showing = promotionRepository.save(promotion("노출 중", seoulNow.minusMinutes(5), seoulNow.plusMinutes(5)));
        Promotion ended = promotionRepository.save(promotion("종료됨", seoulNow.minusMinutes(10), seoulNow.minusMinutes(1)));
        Promotion notStarted = promotionRepository.save(promotion("예정", seoulNow.plusMinutes(1), seoulNow.plusMinutes(10)));

        Page<Promotion> visible = promotionRepository.findPublicActive(PageRequest.of(0, 10));

        assertThat(visible.getContent()).extracting(Promotion::getId).contains(showing.getId());
        assertThat(visible.getContent()).extracting(Promotion::getId)
                .doesNotContain(ended.getId(), notStarted.getId());
    }

    private Promotion promotion(String title, LocalDateTime startAt, LocalDateTime endAt) {
        return Promotion.create(
                null, title, "https://example.com/banner.png", "https://example.com",
                true, 0, 1L,
                null, null, null, null,
                null,
                startAt, endAt,
                null, null,
                null);
    }
}
