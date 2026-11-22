package com.duing.domain.notice.broadcast.repository;

import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcast.noticeBroadcast;
import static com.duing.domain.notice.broadcast.entity.QNoticeBroadcastRead.noticeBroadcastRead;
import static com.duing.domain.notice.entity.QNotice.notice;

import com.duing.domain.notice.entity.NoticeVisibility;
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
                .join(notice).on(broadcastableNotice())
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
                .join(notice).on(broadcastableNotice())
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
                .join(notice).on(broadcastableNotice())
                .where(noticeBroadcast.createdAt.goe(NotificationRetention.visibilityFloor(clock)))
                .fetchOne();
        return count == null ? 0L : count;
    }

    // 전체 알림은 지금도 '삭제 안 됨 · 전체 공개 · 알림 발송'인 공지의 것만 보인다(#1750) — 공지 삭제·범위 축소·알림 끔을 읽는 쪽에서 거른다.
    // deletedAt 은 Hibernate 가 조인에 @SQLRestriction 을 붙여 겹치더라도 명시한다 — 버전이 바뀌어도 판정이 같게.
    // 같은 조건을 네이티브로 한 벌 더 쓰는 곳: NoticeBroadcastReadRepository#bulkInsertVisibleBroadcastReads — 바꾸면 함께 바꾼다.
    private static BooleanExpression broadcastableNotice() {
        return notice.id.eq(noticeBroadcast.noticeId)
                .and(notice.deletedAt.isNull())
                .and(notice.visibility.eq(NoticeVisibility.PUBLIC))
                .and(notice.notifyOnPublish.isTrue());
    }
}
