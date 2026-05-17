package com.duing.domain.notification.repository;

import static com.duing.domain.notification.entity.QNotification.notification;

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
        List<Notification> content = queryFactory
                .selectFrom(notification)
                .where(
                        notification.userId.eq(userId),
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
                        unreadOnlyCondition(unreadOnly)
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
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

    private BooleanExpression unreadOnlyCondition(boolean unreadOnly) {
        return unreadOnly ? notification.readAt.isNull() : null;
    }
}
