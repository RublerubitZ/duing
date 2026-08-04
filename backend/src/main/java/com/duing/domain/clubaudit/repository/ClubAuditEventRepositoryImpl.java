package com.duing.domain.clubaudit.repository;

import static com.duing.domain.clubaudit.entity.QClubAuditEvent.clubAuditEvent;

import com.duing.domain.clubaudit.entity.ClubAuditEvent;
import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.Predicate;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class ClubAuditEventRepositoryImpl implements ClubAuditEventRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<ClubAuditEvent> searchFeeEvents(Long clubId, Collection<ClubAuditEventType> types,
                                                LocalDateTime createdFrom, LocalDateTime createdTo,
                                                Pageable pageable) {
        // clubId 는 동아리 격리의 필수 조건이다(FeeBillRepositoryImpl 과 같은 가드).
        // null 이면 where 절에서 격리가 사라져 전 동아리 감사 이력이 한 화면에 쏟아진다.
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 대상 종류가 하나도 없으면 결과도 없다 — 빈 IN 절 쿼리를 DB 로 내보내지 않는다.
        if (types == null || types.isEmpty()) {
            return Page.empty(pageable);
        }
        // (club_id, event_type, created_at) 인덱스(V105)를 그대로 타는 조건이다.
        Predicate[] conditions = {
                clubAuditEvent.clubId.eq(clubId),
                clubAuditEvent.eventType.in(types),
                createdFrom == null ? null : clubAuditEvent.createdAt.goe(createdFrom),
                createdTo == null ? null : clubAuditEvent.createdAt.lt(createdTo)
        };

        List<ClubAuditEvent> content = queryFactory
                .selectFrom(clubAuditEvent)
                .where(conditions)
                // 같은 트랜잭션에서 나온 이벤트는 created_at 이 동률일 수 있어 id 로 순서를 고정한다.
                .orderBy(clubAuditEvent.createdAt.desc(), clubAuditEvent.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(clubAuditEvent.count())
                .from(clubAuditEvent)
                .where(conditions)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public long countEventsSince(Long clubId, Collection<ClubAuditEventType> types, LocalDateTime since) {
        if (isEmptyScope(clubId, types)) {
            return 0L;
        }
        Long count = queryFactory
                .select(clubAuditEvent.count())
                .from(clubAuditEvent)
                .where(burstConditions(clubId, types, since))
                .fetchOne();
        return count == null ? 0L : count;
    }

    @Override
    public long findMaxEventCountByActorSince(Long clubId, Collection<ClubAuditEventType> types,
                                              LocalDateTime since) {
        if (isEmptyScope(clubId, types)) {
            return 0L;
        }
        // 행위자별 건수를 뽑아 최댓값만 남긴다 — 행이 행위자 수만큼이라(동아리 운영진 규모) 작다.
        return queryFactory
                .select(clubAuditEvent.count())
                .from(clubAuditEvent)
                .where(burstConditions(clubId, types, since))
                .groupBy(clubAuditEvent.actorUserId)
                .fetch().stream()
                .mapToLong(Long::longValue)
                .max()
                .orElse(0L);
    }

    @Override
    public Map<ClubAuditEventType, Long> countEventsByTypeSince(Collection<ClubAuditEventType> types,
                                                                LocalDateTime since) {
        // 대상 종류가 하나도 없으면 셀 것도 없다 — 빈 IN 절 쿼리를 DB 로 내보내지 않는다.
        if (types == null || types.isEmpty()) {
            return Map.of();
        }
        // 전 동아리 집계라 clubId 조건이 없다 — 대시보드는 "오늘 플랫폼 전체에 무슨 일이 있었나"를 본다.
        List<Tuple> countsByType = queryFactory
                .select(clubAuditEvent.eventType, clubAuditEvent.count())
                .from(clubAuditEvent)
                .where(clubAuditEvent.eventType.in(types),
                        since == null ? null : clubAuditEvent.createdAt.goe(since))
                .groupBy(clubAuditEvent.eventType)
                .fetch();

        // GROUP BY 결과 그대로 담는다 — 0 건인 종류는 키를 만들지 않는다(스펙 §7.2).
        return countsByType.stream().collect(Collectors.toMap(
                row -> row.get(clubAuditEvent.eventType),
                row -> row.get(clubAuditEvent.count())));
    }

    private static boolean isEmptyScope(Long clubId, Collection<ClubAuditEventType> types) {
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 대상 종류가 하나도 없으면 셀 것도 없다 — 빈 IN 절 쿼리를 DB 로 내보내지 않는다.
        return types == null || types.isEmpty();
    }

    private static Predicate[] burstConditions(Long clubId, Collection<ClubAuditEventType> types,
                                               LocalDateTime since) {
        return new Predicate[]{
                clubAuditEvent.clubId.eq(clubId),
                clubAuditEvent.eventType.in(types),
                since == null ? null : clubAuditEvent.createdAt.goe(since)
        };
    }
}
