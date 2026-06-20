package com.duing.domain.notification.repository;

import static com.duing.domain.notification.entity.QNotification.notification;

import com.duing.domain.notification.NotificationRetention;
import com.duing.domain.notification.entity.Notification;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class NotificationRepositoryImpl implements NotificationRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Notification> findMine(Long userId, boolean unreadOnly, Pageable pageable) {
        LocalDateTime visibilityFloor = NotificationRetention.visibilityFloor();

        List<Notification> content = queryFactory
                .selectFrom(notification)
                .where(
                        notification.userId.eq(userId),
                        notification.createdAt.goe(visibilityFloor),
                        unreadOnlyCondition(unreadOnly)
                )
                .orderBy(notification.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(notification.count())
                .from(notification)
                .where(
                        notification.userId.eq(userId),
                        notification.createdAt.goe(visibilityFloor),
                        unreadOnlyCondition(unreadOnly)
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public long countUnreadWithinRetention(Long userId) {
        Long count = queryFactory
                .select(notification.count())
                .from(notification)
                .where(
                        notification.userId.eq(userId),
                        notification.readAt.isNull(),
                        notification.createdAt.goe(NotificationRetention.visibilityFloor())
                )
                .fetchOne();
        return count == null ? 0L : count;
    }

    @Override
    public int markAllRead(Long userId) {
        long updatedCount = queryFactory
                .update(notification)
                .set(notification.readAt, LocalDateTime.now())
                .where(
                        notification.userId.eq(userId),
                        notification.readAt.isNull()
                )
                .execute();

        return (int) updatedCount;
    }

    @Override
    public int deleteCreatedBefore(LocalDateTime cutoff) {
        return (int) queryFactory
                .delete(notification)
                .where(notification.createdAt.lt(cutoff))
                .execute();
    }

    private BooleanExpression unreadOnlyCondition(boolean unreadOnly) {
        return unreadOnly ? notification.readAt.isNull() : null;
    }
}
