package com.duing.domain.notice.repository;

import static com.duing.domain.notice.entity.QNotice.notice;
import static com.duing.domain.notice.entity.QNoticeTargetClub.noticeTargetClub;

import com.duing.domain.notice.entity.Notice;
import com.duing.domain.notice.entity.NoticeCategory;
import com.duing.domain.notice.entity.NoticeClubScopeRole;
import com.duing.domain.notice.entity.NoticeVisibility;
import com.duing.domain.notice.service.dto.query.NoticeAdminSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSearchCondition;
import com.duing.domain.notice.service.dto.query.NoticeSource;
import com.duing.domain.notice.service.dto.query.ViewerScope;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.Clock;
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
    // expiresAt 은 운영자가 KST 벽시계로 입력한다 — 만료 판정도 같은 기준(seoulClock)으로 비교해야
    // prod(UTC JVM)에서 만료가 9시간 늦게 적용되지 않는다.
    private final Clock clock;

    @Override
    public Page<Notice> findFeed(NoticeSearchCondition condition, ViewerScope viewer, Pageable pageable) {
        BooleanExpression[] predicates = {
                notExpired(),
                visibilityForViewer(viewer),
                sourceEq(condition.source()),
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

    @Override
    public Page<Notice> findClubScopedForMember(Long clubId, Pageable pageable) {
        LocalDateTime now = LocalDateTime.now(clock);

        BooleanExpression where = notice.visibility.eq(NoticeVisibility.CLUB_SCOPED)
                .and(notice.clubScopeRole.eq(NoticeClubScopeRole.ALL_MEMBERS))
                .and(notice.expiresAt.isNull().or(notice.expiresAt.gt(now)))
                .and(notice.id.in(
                        JPAExpressions.select(noticeTargetClub.id.noticeId)
                                .from(noticeTargetClub)
                                .where(noticeTargetClub.id.clubId.eq(clubId))
                ));

        List<Notice> content = queryFactory.selectFrom(notice)
                .where(where)
                .orderBy(notice.pinned.desc(), notice.createdAt.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory.select(notice.count()).from(notice).where(where).fetchOne();
        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    private BooleanExpression notExpired() {
        return notice.expiresAt.isNull().or(notice.expiresAt.gt(LocalDateTime.now(clock)));
    }

    private BooleanExpression categoryEq(NoticeCategory category) {
        return category == null ? null : notice.category.eq(category);
    }

    // 출처는 작성 주체(owning_club_id)로 가른다 — 학교(관리자) 작성은 NULL, 동아리 작성은 NOT NULL.
    // null/not-null 로 가시 공지를 완전 분할하므로 어떤 공지도 두 탭 사이로 새지 않는다(놓치지 않기).
    // 관리자가 특정 동아리를 대상으로 쓴 CLUB_SCOPED 공지도 owning_club_id 가 NULL 이라 SCHOOL 로 분류된다
    // — 동아리가 직접 쓴 공지가 아니므로 "내 동아리"(가입 동아리 작성)에 넣지 않는 것이 의도다.
    private BooleanExpression sourceEq(NoticeSource source) {
        if (source == null) return null;
        return source == NoticeSource.SCHOOL
                ? notice.owningClubId.isNull()
                : notice.owningClubId.isNotNull();
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
