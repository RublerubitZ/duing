package com.duing.domain.notice.repository;

import static com.duing.domain.notice.entity.QNotice.notice;
import static com.duing.domain.notice.entity.QNoticeTargetClub.noticeTargetClub;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class NoticeRepositoryImpl implements NoticeRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<Notice> findFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable) {
        BooleanExpression[] predicates = {
                notExpired(),
                visibilityForViewer(viewer),
                categoryEq(condition.category()),
                keywordContains(condition.keyword()),
                tagsOverlap(condition.tags())
        };

        List<Notice> content = queryFactory
                .selectFrom(notice)
                .where(predicates)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(notice.count())
                .from(notice)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public Optional<Notice> findVisibleById(Long noticeId, ViewerScope viewer) {
        Notice found = queryFactory
                .selectFrom(notice)
                .where(notice.id.eq(noticeId), visibilityForViewer(viewer))
                .fetchOne();
        return Optional.ofNullable(found);
    }

    @Override
    public Page<Notice> findAdminList(NoticeAdminSearchCondition condition, Pageable pageable) {
        BooleanExpression[] predicates = {
                condition.includeExpired() ? null : notExpired(),
                categoryEq(condition.category()),
                visibilityEq(condition.visibility()),
                keywordContains(condition.keyword())
        };

        List<Notice> content = queryFactory
                .selectFrom(notice)
                .where(predicates)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(notice.count())
                .from(notice)
                .where(predicates)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression notExpired() {
        return notice.expiresAt.isNull().or(notice.expiresAt.gt(LocalDateTime.now()));
    }

    private BooleanExpression categoryEq(NoticeCategory category) {
        return category == null ? null : notice.category.eq(category);
    }

    private BooleanExpression visibilityEq(NoticeVisibility visibility) {
        return visibility == null ? null : notice.visibility.eq(visibility);
    }

    private BooleanExpression keywordContains(String keyword) {
        if (!StringUtils.hasText(keyword)) return null;
        return notice.title.containsIgnoreCase(keyword).or(notice.summary.containsIgnoreCase(keyword));
    }

    private BooleanExpression tagsOverlap(List<String> tags) {
        if (tags == null || tags.isEmpty()) return null;
        String csv = String.join(",", tags);
        return Expressions.booleanTemplate(
                "function('array_overlap_text', {0}, {1}) = true",
                notice.tags,
                csv
        );
    }

    private BooleanExpression neverMatch() {
        return Expressions.booleanTemplate("1=0");
    }

    private BooleanExpression visibilityForViewer(ViewerScope viewer) {
        if (viewer.isAdmin()) return null;

        BooleanExpression publicOnly = notice.visibility.eq(NoticeVisibility.PUBLIC);
        if (viewer.isAnonymous()) return publicOnly;

        Set<Long> memberClubIds = viewer.memberClubIds();
        Set<Long> officerClubIds = viewer.officerClubIds();

        BooleanExpression officersAll = officerClubIds.isEmpty()
                ? neverMatch()
                : notice.visibility.eq(NoticeVisibility.OFFICERS_ALL);

        BooleanExpression scopedOfficers = officerClubIds.isEmpty() ? neverMatch()
                : notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                    .and(notice.clubScopeRole.in(NoticeClubScopeRole.OFFICERS_ONLY, NoticeClubScopeRole.ALL_MEMBERS))
                    .and(JPAExpressions.selectOne().from(noticeTargetClub)
                            .where(noticeTargetClub.id.noticeId.eq(notice.id),
                                   noticeTargetClub.id.clubId.in(officerClubIds))
                            .exists());

        BooleanExpression scopedMembers = memberClubIds.isEmpty() ? neverMatch()
                : notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                    .and(notice.clubScopeRole.eq(NoticeClubScopeRole.ALL_MEMBERS))
                    .and(JPAExpressions.selectOne().from(noticeTargetClub)
                            .where(noticeTargetClub.id.noticeId.eq(notice.id),
                                   noticeTargetClub.id.clubId.in(memberClubIds))
                            .exists());

        return publicOnly.or(officersAll).or(scopedOfficers).or(scopedMembers);
    }
}
