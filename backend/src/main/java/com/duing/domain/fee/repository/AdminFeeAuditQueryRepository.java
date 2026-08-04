package com.duing.domain.fee.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.fee.entity.QBankTransaction.bankTransaction;
import static com.duing.domain.fee.entity.QFeeBill.feeBill;
import static com.duing.domain.fee.entity.QFeePolicy.feePolicy;
import static com.duing.domain.fee.entity.QPayment.payment;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeKpiProjection;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.querydsl.core.types.Projections;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.CaseBuilder;
import com.querydsl.core.types.dsl.DateTimeExpression;
import com.querydsl.core.types.dsl.NumberExpression;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

/**
 * 총동연 회비 감사 콘솔의 횡단 집계 전용 리포지토리.
 *
 * <p>기존 {@code FeeBillRepositoryImpl} 은 clubId 를 필수 가드로 요구하는 동아리 격리 쿼리라
 * 전 동아리 횡단 집계에는 쓸 수 없어 신설했다. 집계는 테이블별 GROUP BY 소쿼리로 나누고
 * 병합은 서비스가 메모리에서 한다(스펙 §10) — 동아리 수백 규모라 상관 서브쿼리 소용돌이를 피하는 쪽이 싸다.
 *
 * <p>soft delete 행은 각 엔티티의 {@code @SQLRestriction} 이 SELECT 에 자동으로 적용해 제외한다.
 * clubId 인자는 전부 nullable 이며, null 이면 전 동아리(목록·대시보드), 값이 있으면 단건 상세용이다.
 */
@Repository
@RequiredArgsConstructor
public class AdminFeeAuditQueryRepository {

    private final JPAQueryFactory queryFactory;

    /** 목록 대상 동아리 — 삭제 제외 + ACTIVE·INACTIVE 만(스펙 §7.1). q 는 동아리명 부분 일치. */
    public List<AdminFeeClubBasics> findClubs(String q) {
        return queryFactory
                .select(Projections.constructor(AdminFeeClubBasics.class, club.id, club.name, club.status))
                .from(club)
                .where(club.status.in(ClubStatus.ACTIVE, ClubStatus.INACTIVE), clubNameContains(q))
                .fetch();
    }

    /** 동아리별 청구 집계(CANCELLED 제외) — 건수와 청구액 합계. */
    public Map<Long, AdminFeeBillAggregate> aggregateBills(AdminFeePeriod period, Long clubId) {
        NumberExpression<Long> billCount = feeBill.count();
        NumberExpression<Long> totalBilled = feeBill.amount.sum().coalesce(0L);
        return queryFactory
                .select(feeBill.clubId, billCount, totalBilled)
                .from(feeBill)
                .where(feeBill.status.ne(FeeStatus.CANCELLED), billClubIdEq(clubId),
                        createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(feeBill.clubId),
                        row -> new AdminFeeBillAggregate(row.get(billCount), row.get(totalBilled))));
    }

    /**
     * 동아리별 수납 집계 — 기간 내 발행 청구의 ACTIVE 납부 합계와 최근 납부 시각.
     * 납부 시점이 기간을 벗어나도 포함한다(스펙 §7.0) — 기간 경계에서 수납률·미수금이 자기모순 나지 않게 하기 위해서다.
     */
    public Map<Long, AdminFeePaymentAggregate> aggregatePayments(AdminFeePeriod period, Long clubId) {
        NumberExpression<Long> totalPaid = payment.amount.sum().coalesce(0L);
        DateTimeExpression<LocalDateTime> lastPaidAt = payment.paidAt.max();
        return queryFactory
                .select(feeBill.clubId, totalPaid, lastPaidAt)
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId))
                .where(payment.status.eq(PaymentStatus.ACTIVE), feeBill.status.ne(FeeStatus.CANCELLED),
                        billClubIdEq(clubId), createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(feeBill.clubId),
                        row -> new AdminFeePaymentAggregate(row.get(totalPaid), row.get(lastPaidAt))));
    }

    /** 동아리별 미납 인원 — 미납 청구를 여러 건 가진 회원도 1명으로 센다. */
    public Map<Long, Long> countUnpaidMembers(AdminFeePeriod period) {
        NumberExpression<Long> unpaidMembers = feeBill.userId.countDistinct();
        return queryFactory
                .select(feeBill.clubId, unpaidMembers)
                .from(feeBill)
                .where(feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE),
                        createdGoe(period), createdLt(period))
                .groupBy(feeBill.clubId)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(feeBill.clubId), row -> row.get(unpaidMembers)));
    }

    /** 동아리별 활성 정책 수 — 기간과 무관한 현재 상태값이다. */
    public Map<Long, Long> countActivePolicies(Long clubId) {
        NumberExpression<Long> policyCount = feePolicy.count();
        return queryFactory
                .select(feePolicy.clubId, policyCount)
                .from(feePolicy)
                .where(feePolicy.active.isTrue(), policyClubIdEq(clubId))
                .groupBy(feePolicy.clubId)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(feePolicy.clubId), row -> row.get(policyCount)));
    }

    /** 동아리별 활동 회원 수 — 탈퇴(soft delete) 회원은 @SQLRestriction 으로 빠진다. */
    public Map<Long, Long> countMembers(Long clubId) {
        NumberExpression<Long> memberCount = clubMember.count();
        return queryFactory
                .select(clubMember.club.id, memberCount)
                .from(clubMember)
                .where(memberClubIdEq(clubId))
                .groupBy(clubMember.club.id)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(clubMember.club.id), row -> row.get(memberCount)));
    }

    /** 동아리별 최근 거래 시각 — KST 벽시계로 적재된 값이다. */
    public Map<Long, LocalDateTime> findLastTransactionAt() {
        DateTimeExpression<LocalDateTime> lastTransactionAt = bankTransaction.transactionAt.max();
        return queryFactory
                .select(bankTransaction.clubId, lastTransactionAt)
                .from(bankTransaction)
                .groupBy(bankTransaction.clubId)
                .fetch().stream()
                .collect(Collectors.toMap(row -> row.get(bankTransaction.clubId),
                        row -> row.get(lastTransactionAt)));
    }

    /**
     * 상세 KPI — 완납/미납/연체/취소 파생 분류(스펙 §7.3). {@code today} 는 KST 오늘이며 서비스가 넘긴다.
     *
     * <p>연체는 DB status 가 아니라 마감일로 가른다(스펙 §15 결정 10) — OverdueBillJob 이 자정 배치 +
     * env opt-in 이라 status OVERDUE 는 하루 늦거나 영영 안 붙을 수 있고, 감사 콘솔은 배치 상태에 면역이어야 한다.
     * where 에 {@code status != CANCELLED} 를 넣지 않는 이유는 취소 건수 자체를 보여주기 때문이다.
     */
    public AdminFeeKpiProjection summarizeClub(Long clubId, AdminFeePeriod period, LocalDate today) {
        AdminFeeKpiProjection projection = queryFactory
                .select(Projections.constructor(AdminFeeKpiProjection.class,
                        feeBill.count(),
                        statusCount(FeeStatus.PAID),
                        remainderCount(feeBill.dueDate.goe(today)),
                        remainderCount(feeBill.dueDate.lt(today)),
                        statusCount(FeeStatus.CANCELLED)))
                .from(feeBill)
                .where(feeBill.clubId.eq(clubId), createdGoe(period), createdLt(period))
                .fetchOne();
        // 청구가 0건이면 집계 함수가 null 행을 반환할 수 있어 0 으로 정규화한다.
        return projection != null ? projection : new AdminFeeKpiProjection(0L, 0L, 0L, 0L, 0L);
    }

    /** 미납 잔여(PENDING·PARTIAL_PAID·OVERDUE)를 마감일 조건으로 갈라 센다. */
    private NumberExpression<Long> remainderCount(BooleanExpression dueDateCondition) {
        return new CaseBuilder()
                .when(feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE)
                        .and(dueDateCondition)).then(1L).otherwise(0L)
                .sum().coalesce(0L);
    }

    private NumberExpression<Long> statusCount(FeeStatus status) {
        return new CaseBuilder()
                .when(feeBill.status.eq(status)).then(1L).otherwise(0L)
                .sum().coalesce(0L);
    }

    private BooleanExpression clubNameContains(String q) {
        return StringUtils.hasText(q) ? club.name.containsIgnoreCase(q) : null;
    }

    private BooleanExpression billClubIdEq(Long clubId) {
        return clubId == null ? null : feeBill.clubId.eq(clubId);
    }

    private BooleanExpression policyClubIdEq(Long clubId) {
        return clubId == null ? null : feePolicy.clubId.eq(clubId);
    }

    private BooleanExpression memberClubIdEq(Long clubId) {
        return clubId == null ? null : clubMember.club.id.eq(clubId);
    }

    private BooleanExpression createdGoe(AdminFeePeriod period) {
        return period.createdFrom() == null ? null : feeBill.createdAt.goe(period.createdFrom());
    }

    private BooleanExpression createdLt(AdminFeePeriod period) {
        return period.createdTo() == null ? null : feeBill.createdAt.lt(period.createdTo());
    }
}
