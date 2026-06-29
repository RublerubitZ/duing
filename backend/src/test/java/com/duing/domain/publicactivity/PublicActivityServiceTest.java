package com.duing.domain.publicactivity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.duing.domain.publicactivity.config.PublicActivityProperties;
import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.publicactivity.repository.PublicActivityQueryRepository;
import com.duing.domain.publicactivity.service.GeneralPublicActivityService;
import com.duing.domain.publicactivity.service.PublicActivityService;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PublicActivityServiceTest {

    @Mock PublicActivityQueryRepository repository;

    PublicActivityService service;
    final Clock clock = Clock.fixed(Instant.parse("2026-06-29T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    ActivityItem item(PublicActivityType type, long clubId, String name, String iso) {
        return new ActivityItem(type, clubId, name, Instant.parse(iso));
    }

    @BeforeEach
    void setUp() {
        var props = new PublicActivityProperties(30, 10, 20);
        service = new GeneralPublicActivityService(repository, props, clock);
    }

    private void stubAllEmptyExceptRecruit(List<ActivityItem> recruit) {
        when(repository.findRecentRecruitOpen(any(), anyInt())).thenReturn(recruit);
        when(repository.findRecentNoticeCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentInterviewCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentInterviewResult(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentEventCreated(any(), anyInt())).thenReturn(List.of());
        when(repository.findRecentFeeOpen(any(), anyInt())).thenReturn(List.of());
    }

    @Test
    @DisplayName("여러 소스 활동을 occurredAt 최신순으로 정렬해 반환한다")
    void 머지_후_occurredAt_내림차순_정렬() {
        stubAllEmptyExceptRecruit(List.of(
                item(PublicActivityType.RECRUIT_OPEN, 1L, "A", "2026-06-20T00:00:00Z"),
                item(PublicActivityType.RECRUIT_OPEN, 2L, "B", "2026-06-25T00:00:00Z")));
        List<ActivityItem> result = service.getRecentActivities(null);
        assertThat(result).extracting(ActivityItem::clubId).containsExactly(2L, 1L); // 최신(25일) 먼저
    }

    @Test
    @DisplayName("occurredAt 이 같으면 clubId 내림차순, 그 다음 type 오름차순으로 정렬한다")
    void 동일_occurredAt_은_clubId_DESC_그다음_type_ASC() {
        String t = "2026-06-25T00:00:00Z";
        stubAllEmptyExceptRecruit(List.of(
                item(PublicActivityType.NOTICE_CREATED, 9L, "I-notice", t),  // clubId 9, type=1
                item(PublicActivityType.RECRUIT_OPEN,   9L, "I-recruit", t), // clubId 9, type=0
                item(PublicActivityType.RECRUIT_OPEN,   5L, "E",         t)));
        List<ActivityItem> result = service.getRecentActivities(null);
        // clubId DESC: 9,9 먼저; 같은 9 중 type ASC: RECRUIT_OPEN(0) → NOTICE_CREATED(1); 그 뒤 clubId 5
        assertThat(result)
                .extracting(ActivityItem::clubId, ActivityItem::type)
                .containsExactly(
                        tuple(9L, PublicActivityType.RECRUIT_OPEN),
                        tuple(9L, PublicActivityType.NOTICE_CREATED),
                        tuple(5L, PublicActivityType.RECRUIT_OPEN));
    }

    @Test
    @DisplayName("limit 미지정 시 default-limit 만큼 반환한다")
    void limit_미지정시_defaultLimit_적용() {
        stubAllEmptyExceptRecruit(java.util.stream.IntStream.range(0, 15)
                .mapToObj(i -> item(PublicActivityType.RECRUIT_OPEN, i, "C" + i,
                        "2026-06-%02dT00:00:00Z".formatted(1 + i)))
                .toList());
        assertThat(service.getRecentActivities(null)).hasSize(10); // default
    }

    @Test
    @DisplayName("limit 이 max-limit 을 초과하면 max-limit 으로 클램프한다")
    void limit_상한_초과는_maxLimit_로_클램프() {
        stubAllEmptyExceptRecruit(java.util.stream.IntStream.range(0, 25)
                .mapToObj(i -> item(PublicActivityType.RECRUIT_OPEN, i, "C" + i,
                        "2026-06-%02dT00:00:00Z".formatted(1 + i)))
                .toList());
        assertThat(service.getRecentActivities(50)).hasSize(20); // max
    }

    @Test
    @DisplayName("limit 이 1 미만이면 1로 클램프한다")
    void limit_1미만은_1로_클램프() {
        stubAllEmptyExceptRecruit(List.of(item(PublicActivityType.RECRUIT_OPEN, 1L, "A", "2026-06-25T00:00:00Z")));
        assertThat(service.getRecentActivities(0)).hasSize(1);
        assertThat(service.getRecentActivities(-5)).hasSize(1);
    }
}
