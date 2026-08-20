package com.duing.domain.notice.broadcast.repository;

import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcast.noticeBroadcast;
import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcastRead.noticeBroadcastRead;

import com.duing.domain.notification.NotificationRetention;
import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class NoticeBroadcastRepositoryImpl implements NoticeBroadcastRepositoryCustom {

    private final JPAQueryFactory queryFactory;
    private final Clock clock;

    @Override
    public List<BroadcastSlice> findSliceForUser(Long userId, int limit) {
        BooleanExpression readJoin = noticeBroadcastRead.id.broadcastId.eq(noticeBroadcast.id)
                .and(noticeBroadcastRead.id.userId.eq(userId));

        List<Tuple> rows = queryFactory
                .select(noticeBroadcast, noticeBroadcastRead.readAt)
                .from(noticeBroadcast)
                .leftJoin(noticeBroadcastRead).on(readJoin)
                .where(noticeBroadcast.createdAt.goe(NotificationRetention.visibilityFloor(clock)))
                .orderBy(noticeBroadcast.createdAt.desc())
                .limit(limit)
                .fetch();

        return rows.stream()
                .map(row -> new BroadcastSlice(
                        row.get(noticeBroadcast),
                        row.get(noticeBroadcastRead.readAt) != null))
                .toList();
    }

    @Override
    public long countUnreadForUser(Long userId) {
        BooleanExpression readJoin = noticeBroadcastRead.id.broadcastId.eq(noticeBroadcast.id)
                .and(noticeBroadcastRead.id.userId.eq(userId));

        Long count = queryFactory
                .select(noticeBroadcast.count())
                .from(noticeBroadcast)
                .leftJoin(noticeBroadcastRead).on(readJoin)
                .where(
                        noticeBroadcastRead.id.userId.isNull(),
                        noticeBroadcast.createdAt.goe(NotificationRetention.visibilityFloor(clock))
                )
                .fetchOne();
        return count == null ? 0L : count;
    }

    @Override
    public long countWithinRetention() {
        Long count = queryFactory
                .select(noticeBroadcast.count())
                .from(noticeBroadcast)
                .where(noticeBroadcast.createdAt.goe(NotificationRetention.visibilityFloor(clock)))
                .fetchOne();
        return count == null ? 0L : count;
    }
}
