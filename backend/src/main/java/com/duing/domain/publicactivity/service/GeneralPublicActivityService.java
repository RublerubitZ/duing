package com.duing.domain.publicactivity.service;

import com.duing.domain.publicactivity.config.PublicActivityProperties;
import com.duing.domain.publicactivity.repository.PublicActivityQueryRepository;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralPublicActivityService implements PublicActivityService {

    private final PublicActivityQueryRepository queryRepository;
    private final PublicActivityProperties properties;
    private final Clock clock;

    // 정렬: occurredAt DESC → clubId DESC → type ASC (clubName 은 가변값이라 미사용).
    private static final Comparator<ActivityItem> ORDER =
            Comparator.comparing(ActivityItem::occurredAt).reversed()
                    .thenComparing(Comparator.comparing(ActivityItem::clubId).reversed())
                    .thenComparing(ActivityItem::type);

    @Override
    public List<ActivityItem> getRecentActivities(Integer limitParam) {
        int effectiveLimit = clampLimit(limitParam);
        int sourceFetchLimit = effectiveLimit * 2; // 머지 헤드룸
        LocalDateTime since = LocalDateTime.now(clock).minusDays(properties.windowDays());

        List<ActivityItem> merged = new ArrayList<>();
        merged.addAll(queryRepository.findRecentRecruitOpen(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentNoticeCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentInterviewCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentInterviewResult(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentEventCreated(since, sourceFetchLimit));
        merged.addAll(queryRepository.findRecentFeeOpen(since, sourceFetchLimit));

        return merged.stream().sorted(ORDER).limit(effectiveLimit).toList();
    }

    private int clampLimit(Integer limitParam) {
        int requested = (limitParam == null) ? properties.defaultLimit() : limitParam;
        return Math.max(1, Math.min(requested, properties.maxLimit()));
    }
}
