package com.duing.domain.fee.repository;

import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.fee.entity.QFeeBill.feeBill;
import static com.duing.domain.fee.entity.QPayment.payment;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.Expressions;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.JPAExpressions;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.Collection;
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
    public Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, LocalDate today, Pageable pageable) {
        // clubId 는 동아리 격리의 필수 조건이다. null 이면 where 절에서 격리가 사라져 전 동아리 청구가
        // 노출되므로 진입 시점에 가드한다(searchClubBills 는 항상 경로의 clubId 로 호출됨).
        Objects.requireNonNull(clubId, "clubId must not be null");
        List<FeeBill> content = queryFactory
                .selectFrom(feeBill)
                .where(
                        clubIdEq(clubId),
                        billingPeriodEq(query.billingPeriod()),
                        displayStatusEq(query.status(), today),
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
                        displayStatusEq(query.status(), today),
                        userIdEq(query.userId())
                )
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    @Override
    public List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query, LocalDate today) {
        // userId 는 본인 회비 격리의 필수 조건이다. null 이면 where 절에서 격리가 사라져 전 사용자 청구가
        // 노출되므로 진입 시점에 가드하고, null-safe 헬퍼가 아닌 직접 술어로 격리를 보장한다.
        Objects.requireNonNull(userId, "userId must not be null");
        return queryFactory
                .selectFrom(feeBill)
                .where(
                        feeBill.userId.eq(userId),
                        clubIdEq(query.clubId()),
                        displayStatusEq(query.status(), today)
                )
                .orderBy(feeBill.dueDate.desc(), feeBill.id.desc())
                .fetch();
    }

    @Override
    public FeeBillSummaryProjection summarizeBills(Long clubId, FeeBillSummaryQuery query, LocalDate today) {
        // clubId 는 동아리 격리의 필수 조건이다(searchClubBills 와 동일 가드). null 이면 전 동아리 집계가 노출된다.
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 청구 그레인 단독 집계. payment 를 조인하면 1:N fan-out 으로 totalBilled 가 납부 건수만큼 중복 합산되므로
        // 납부 합계는 sumActivePaid 의 별도 쿼리에서 산출한다.
        FeeBillSummaryProjection projection = queryFactory
                .select(Projections.constructor(FeeBillSummaryProjection.class,
                        feeBill.amount.sum().coalesce(0L),
                        feeBill.count(),
                        // 카운트도 표기 축 — displayStatusEq 와 동일한 동치 근거(위 주석). paid/cancelled 는 저장=표기.
                        displayCount(FeeStatus.PENDING, today),
                        displayCount(FeeStatus.PARTIAL_PAID, today),
                        displayCount(FeeStatus.OVERDUE, today),
                        displayCount(FeeStatus.PAID, today)))
                .from(feeBill)
                .where(
                        feeBill.clubId.eq(clubId),
                        billingPeriodEq(query.billingPeriod()),
                        feePolicyIdEq(query.feePolicyId()),
                        feeBill.status.ne(FeeStatus.CANCELLED)
                )
                .fetchOne();
        // 청구가 0건이면 집계 함수가 null 행을 반환할 수 있어 0 으로 정규화한다.
        return projection != null ? projection : new FeeBillSummaryProjection(0L, 0L, 0L, 0L, 0L, 0L);
    }

    @Override
    public long sumActivePaid(Long clubId, FeeBillSummaryQuery query) {
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 같은 청구 필터(동아리·회차·정책·비취소)에 걸린 청구의 활성 납부만 합산한다.
        // VOIDED 납부는 payment.status.eq(ACTIVE) 로, soft-delete 청구·납부는 @SQLRestriction 으로 제외된다.
        Long total = queryFactory
                .select(payment.amount.sum().coalesce(0L))
                .from(payment)
                .join(feeBill).on(payment.feeBillId.eq(feeBill.id))
                .where(
                        feeBill.clubId.eq(clubId),
                        billingPeriodEq(query.billingPeriod()),
                        feePolicyIdEq(query.feePolicyId()),
                        feeBill.status.ne(FeeStatus.CANCELLED),
                        payment.status.eq(PaymentStatus.ACTIVE)
                )
                .fetchOne();
        return total != null ? total : 0L;
    }

    @Override
    public List<MatchCandidate> findMatchCandidates(Long clubId, long depositAmount) {
        // clubId 는 동아리 격리의 필수 조건이다(다른 동아리 청구에 입금이 매칭되면 안 됨).
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 청구별 활성 납부 합계를 상관 서브쿼리로 산출한다(VOIDED 제외). payment 를 조인하면 1:N fan-out 으로
        // 같은 청구가 납부 건수만큼 중복되므로 서브쿼리로 청구 그레인을 유지한다.
        NumberExpression<Long> activePaidSum = Expressions.asNumber(JPAExpressions
                .select(payment.amount.sum().coalesce(0L))
                .from(payment)
                .where(payment.feeBillId.eq(feeBill.id), payment.status.eq(PaymentStatus.ACTIVE)));
        // FeeBill.remainingAfter() 의 SQL 미러 — 후보 필터(where)와 표시값(select) 양쪽에 쓰여 스칼라 호출로 뺄 수 없다.
        // 잔액 정의를 바꾸면 엔티티 메서드와 함께 바꿀 것.
        NumberExpression<Long> remaining = feeBill.amount.subtract(activePaidSum);
        return queryFactory
                .select(Projections.constructor(MatchCandidate.class,
                        feeBill.id,
                        feeBill.userId,
                        clubMember.user.name,
                        feeBill.billingPeriod,
                        feeBill.dueDate,
                        remaining))
                .from(feeBill)
                // 회원 이름은 club_member(club_id + user_id) → user 로 조인해 얻는다. FeeBill 은 raw userId 만 가지므로 명시 조인.
                // ON 절에 deletedAt.isNull() 을 명시해 탈퇴(soft-delete) 회원도 청구 행은 유지하고 이름만 null 로 남긴다(LEFT JOIN 보존).
                .leftJoin(clubMember)
                .on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId),
                        clubMember.deletedAt.isNull())
                .where(
                        feeBill.clubId.eq(clubId),
                        feeBill.status.in(FeeStatus.unpaidRemainderSet()),
                        remaining.eq(depositAmount))
                .orderBy(feeBill.dueDate.asc(), feeBill.createdAt.desc(), feeBill.id.asc())
                .fetch();
    }

    @Override
    public List<MatchedBillInfo> findMatchedBillInfo(Long clubId, Collection<Long> feeBillIds) {
        // clubId 는 동아리 격리의 필수 조건이다(findMatchCandidates 와 동일 가드). 다른 동아리 청구가 섞이면 안 된다.
        Objects.requireNonNull(clubId, "clubId must not be null");
        // 빈 입력이면 IN () 가 비정상 쿼리가 되므로 쿼리를 생략하고 빈 목록을 반환한다.
        if (feeBillIds == null || feeBillIds.isEmpty()) {
            return List.of();
        }
        // 매칭된 청구는 PAID 라 미납 후보 집합에 없으므로 상태 필터 없이 동아리·id 로만 조회한다.
        // 회원 이름은 findMatchCandidates 와 동일하게 club_member(club_id + user_id) → user 로 LEFT JOIN 한다.
        // ON 절에 deletedAt.isNull() 을 두어 탈퇴 회원은 청구 행은 유지하고 이름만 null 로 남긴다.
        return queryFactory
                .select(Projections.constructor(MatchedBillInfo.class,
                        feeBill.id,
                        clubMember.user.name,
                        feeBill.billingPeriod))
                .from(feeBill)
                .leftJoin(clubMember)
                .on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId),
                        clubMember.deletedAt.isNull())
                .where(feeBill.clubId.eq(clubId), feeBill.id.in(feeBillIds))
                .fetch();
    }

    private NumberExpression<Long> displayCount(FeeStatus displayStatus, LocalDate today) {
        return new CaseBuilder()
                .when(displayStatusEq(displayStatus, today)).then(1L).otherwise(0L)
                .sum().coalesce(0L);
    }

    private BooleanExpression feePolicyIdEq(Long feePolicyId) {
        return feePolicyId != null ? feeBill.feePolicyId.eq(feePolicyId) : null;
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

    /**
     * 상태 필터를 표기 축(displayStatus) 시멘틱으로 해석한다 — FeeStatus.resolveDisplay 의 SQL 미러.
     * 화면 배지가 표기 축이므로 필터도 같은 축이어야 "납부대기로 걸렀는데 연체 배지"가 안 나온다(admin
     * AdminFeeBillFilter 전례). 동치 근거: 납부 변동은 쓰기 경로가 저장 status 를 동기 재산출하므로
     * 저장·표기가 갈리는 유일한 축은 마감 경과(dueDate)뿐이고, dueDate 는 수정 경로가 없어 저장
     * OVERDUE ⇒ 항상 과거 마감이다. 식을 바꾸면 FeeStatus.resolveDisplay 와 함께 바꿀 것.
     */
    private BooleanExpression displayStatusEq(FeeStatus filterStatus, LocalDate today) {
        if (filterStatus == null) {
            return null;
        }
        return switch (filterStatus) {
            case PAID, CANCELLED -> feeBill.status.eq(filterStatus);
            case OVERDUE -> feeBill.status.in(FeeStatus.unpaidRemainderSet()).and(feeBill.dueDate.lt(today));
            case PENDING, PARTIAL_PAID -> feeBill.status.eq(filterStatus).and(feeBill.dueDate.goe(today));
        };
    }
}
