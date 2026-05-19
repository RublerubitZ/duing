package com.duing.domain.notice.broadcast.repository;

import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcast.noticeBroadcast;
import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcastRead.noticeBroadcastRead;

import com.querydsl.core.Tuple;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class NoticeBroadcastRepositoryImpl implements NoticeBroadcastRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public List<BroadcastSlice> findSliceForUser(Long userId, int limit) {
        BooleanExpression readJoin = noticeBroadcastRead.id.broadcastId.eq(noticeBroadcast.id)
                .and(noticeBroadcastRead.id.userId.eq(userId));

        List<Tuple> rows = queryFactory
                .select(noticeBroadcast, noticeBroadcastRead.readAt)
                .from(noticeBroadcast)
                .leftJoin(noticeBroadcastRead).on(readJoin)
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
                .where(noticeBroadcastRead.id.userId.isNull())
                .fetchOne();
        return count == null ? 0L : count;
    }
}
