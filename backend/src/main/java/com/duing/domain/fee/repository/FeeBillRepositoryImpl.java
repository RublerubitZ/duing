package com.duing.domain.fee.repository;

import static com.duing.domain.fee.entity.QFeeBill.feeBill;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.util.StringUtils;

@RequiredArgsConstructor
public class FeeBillRepositoryImpl implements FeeBillRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, Pageable pageable) {
        // clubId 는 동아리 격리의 필수 조건이다. null 이면 where 절에서 격리가 사라져 전 동아리 청구가
        // 노출되므로 진입 시점에 가드한다(searchClubBills 는 항상 경로의 clubId 로 호출됨).
        Objects.requireNonNull(clubId, "clubId must not be null");
        List<FeeBill> content = queryFactory
                .selectFrom(feeBill)
                .where(
                        clubIdEq(clubId),
                        billingPeriodEq(query.billingPeriod()),
                        statusEq(query.status()),
                        userIdEq(query.userId())
                )
                .orderBy(feeBill.createdAt.desc(), feeBill.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(feeBill.count())
                .from(feeBill)
                .where(
                        clubIdEq(clubId),
                        billingPeriodEq(query.billingPeriod()),
                        statusEq(query.status()),
                        userIdEq(query.userId())
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query) {
        // userId 는 본인 회비 격리의 필수 조건이다. null 이면 where 절에서 격리가 사라져 전 사용자 청구가
        // 노출되므로 진입 시점에 가드하고, null-safe 헬퍼가 아닌 직접 술어로 격리를 보장한다.
        Objects.requireNonNull(userId, "userId must not be null");
        return queryFactory
                .selectFrom(feeBill)
                .where(
                        feeBill.userId.eq(userId),
                        clubIdEq(query.clubId()),
                        statusEq(query.status())
                )
                .orderBy(feeBill.dueDate.desc(), feeBill.id.desc())
                .fetch();
    }

    private BooleanExpression clubIdEq(Long clubId) {
        return clubId != null ? feeBill.clubId.eq(clubId) : null;
    }

    private BooleanExpression userIdEq(Long userId) {
        return userId != null ? feeBill.userId.eq(userId) : null;
    }

    private BooleanExpression billingPeriodEq(String billingPeriod) {
        return StringUtils.hasText(billingPeriod) ? feeBill.billingPeriod.eq(billingPeriod) : null;
    }

    private BooleanExpression statusEq(FeeStatus status) {
        return status != null ? feeBill.status.eq(status) : null;
    }
}
