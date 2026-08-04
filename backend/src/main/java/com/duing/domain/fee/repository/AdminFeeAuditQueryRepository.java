package com.duing.domain.fee.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.clubmember.entity.QClubMember.clubMember;
import static com.duing.domain.fee.entity.QBankTransaction.bankTransaction;
import static com.duing.domain.fee.entity.QFeeBill.feeBill;
import static com.duing.domain.fee.entity.QFeePolicy.feePolicy;
import static com.duing.domain.fee.entity.QPayment.payment;
import static com.duing.domain.user.entity.QUser.user;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.fee.entity.FeeStatus;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeBillFilter;
import com.duing.domain.fee.service.dto.query.AdminFeeBillRow;
import com.duing.domain.fee.service.dto.query.AdminFeeBillSort;
import com.duing.domain.fee.service.dto.query.AdminFeeKpiProjection;
import com.duing.domain.fee.service.dto.query.AdminFeePaymentRow;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.AdminFeePolicyRow;
import com.duing.domain.user.entity.QUser;
import com.querydsl.core.types.OrderSpecifier;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
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
                .where(unpaidRemainder(), createdGoe(period), createdLt(period))
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

    /**
     * 콘솔 청구 검색(스펙 §7.5). {@code today} 는 KST 오늘이며 서비스가 넘긴다 —
     * 필터의 연체 판정과 행의 {@code overdue} 플래그가 같은 식·같은 기준일을 쓰게 하기 위한 것이다.
     *
     * <p>회원 이름·학번은 club_member(club_id + user_id) → user 로 LEFT JOIN 해 얻고, 정책명도 LEFT JOIN 이다
     * — 탈퇴 회원·삭제 정책의 청구도 이름만 null 인 채로 행은 남긴다(감사 대상에서 사라지면 안 된다).
     */
    public Page<AdminFeeBillRow> searchBillsForAdmin(Long clubId, AdminFeeBillFilter filter, String q,
                                                     AdminFeePeriod period, LocalDate today,
                                                     AdminFeeBillSort sort, Pageable pageable) {
        BooleanExpression[] conditions = {
                feeBill.clubId.eq(clubId), filterCondition(filter, today), billSearchCondition(q),
                createdGoe(period), createdLt(period)};
        List<AdminFeeBillRow> content = queryFactory
                .select(Projections.constructor(AdminFeeBillRow.class,
                        feeBill.id, feeBill.userId, user.name, user.studentId,
                        clubMember.generation, feePolicy.name, feeBill.billingPeriod,
                        feeBill.amount, payment.amount.sum().coalesce(0L), feeBill.status,
                        overdueFlag(today),
                        feeBill.createdAt, feeBill.dueDate, payment.paidAt.max()))
                .from(feeBill)
                .leftJoin(clubMember).on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId), clubMember.deletedAt.isNull())
                .leftJoin(clubMember.user, user)
                .leftJoin(feePolicy).on(feePolicy.id.eq(feeBill.feePolicyId))
                // 활성 납부만 붙여 청구 그레인으로 접는다 — 조인 뒤 GROUP BY 로 합치므로 납부가 여러 건이어도
                // 청구 행이 늘지 않는다. GROUP BY 는 조인한 테이블의 PK 만 나열하면 된다(Postgres 함수 종속성).
                .leftJoin(payment).on(payment.feeBillId.eq(feeBill.id),
                        payment.status.eq(PaymentStatus.ACTIVE))
                .where(conditions)
                .groupBy(feeBill.id, clubMember.id, user.id, feePolicy.id)
                .orderBy(orderOf(sort))
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(feeBill.count())
                .from(feeBill)
                .leftJoin(clubMember).on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId), clubMember.deletedAt.isNull())
                .leftJoin(clubMember.user, user)
                .where(conditions)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    /**
     * 콘솔 납부 검색(스펙 §7.6). 정정(VOIDED) 납부도 그대로 싣는다 — 정정 이력이 감사의 핵심이다.
     * 기간은 납부일(KST 벽시계) 기준이고, 동아리 격리는 청구 조인의 ON 절이 담당한다.
     */
    public Page<AdminFeePaymentRow> searchPaymentsForAdmin(Long clubId, PaymentStatus status,
                                                           AdminFeePeriod period, Pageable pageable) {
        QUser recordedByUser = new QUser("recordedByUser");
        QUser voidedByUser = new QUser("voidedByUser");
        BooleanExpression[] conditions = {statusEq(status), paidGoe(period), paidLt(period)};
        List<AdminFeePaymentRow> content = queryFactory
                .select(Projections.constructor(AdminFeePaymentRow.class,
                        payment.id, feeBill.id, user.name,
                        payment.amount, payment.method, payment.paidAt,
                        payment.bankTransactionId, bankTransaction.matchStatus,
                        bankTransaction.counterparty, recordedByUser.name, payment.status,
                        voidedByUser.name, payment.voidedAt, payment.voidReason))
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId), feeBill.clubId.eq(clubId))
                .leftJoin(clubMember).on(clubMember.club.id.eq(feeBill.clubId),
                        clubMember.user.id.eq(feeBill.userId), clubMember.deletedAt.isNull())
                .leftJoin(clubMember.user, user)
                .leftJoin(bankTransaction).on(bankTransaction.id.eq(payment.bankTransactionId))
                .leftJoin(recordedByUser).on(recordedByUser.id.eq(payment.recordedBy))
                .leftJoin(voidedByUser).on(voidedByUser.id.eq(payment.voidedBy))
                .where(conditions)
                .orderBy(payment.paidAt.desc(), payment.id.desc())
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();

        Long total = queryFactory
                .select(payment.count())
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId), feeBill.clubId.eq(clubId))
                .where(conditions)
                .fetchOne();

        return new PageImpl<>(content, pageable, total == null ? 0L : total);
    }

    /**
     * 콘솔 정책 목록(스펙 §7.4) — 비활성 정책도 감사 대상이라 active 무관하게 전부 싣는다.
     *
     * <p>청구 집계 조건(기간·취소 제외)을 WHERE 가 아니라 LEFT JOIN 의 ON 절에 두는 이유는,
     * 기간 내 청구가 한 건도 없는 정책도 0건으로 목록에 남겨야 하기 때문이다.
     * GROUP BY 는 PK 하나로 충분하다(Postgres 함수 종속성).
     */
    public List<AdminFeePolicyRow> findPoliciesForAdmin(Long clubId, AdminFeePeriod period) {
        return queryFactory
                .select(Projections.constructor(AdminFeePolicyRow.class,
                        feePolicy.id, feePolicy.name, feePolicy.amount, feePolicy.billingType,
                        feePolicy.targetType, feePolicy.active, feePolicy.autoIssue,
                        feePolicy.issueDay, feePolicy.dueDay,
                        feeBill.id.count(), statusCount(FeeStatus.PAID),
                        feePolicy.createdAt))
                .from(feePolicy)
                // ON 절은 where 와 달리 null 술어를 받지 않으므로 and 로 잇는다(기간 미지정이면 null 이 무시된다).
                .leftJoin(feeBill).on(feeBill.feePolicyId.eq(feePolicy.id)
                        .and(feeBill.status.ne(FeeStatus.CANCELLED))
                        .and(createdGoe(period))
                        .and(createdLt(period)))
                .where(feePolicy.clubId.eq(clubId))
                .groupBy(feePolicy.id)
                .orderBy(feePolicy.id.desc())
                .fetch();
    }

    /**
     * 이상징후 FA-01 — 기간 내 매칭 완료 거래 수와 그중 수동 매칭 수.
     * 매칭 대기(PENDING)·무시(IGNORED) 거래는 "수동으로 처리했는가"를 묻는 Rule 의 모수가 아니라 뺀다.
     */
    public AdminFeeMatchAggregate countMatchedTransactions(Long clubId, AdminFeePeriod period) {
        NumberExpression<Long> manualCount = new CaseBuilder()
                .when(bankTransaction.matchStatus.eq(MatchStatus.MANUAL_MATCHED)).then(1L).otherwise(0L)
                .sum().coalesce(0L);
        AdminFeeMatchAggregate aggregate = queryFactory
                .select(Projections.constructor(AdminFeeMatchAggregate.class,
                        bankTransaction.count(), manualCount))
                .from(bankTransaction)
                .where(bankTransaction.clubId.eq(clubId),
                        bankTransaction.matchStatus.in(MatchStatus.AUTO_MATCHED, MatchStatus.MANUAL_MATCHED),
                        transactionGoe(period), transactionLt(period))
                .fetchOne();
        // 거래가 0건이면 집계 함수가 null 행을 반환할 수 있어 0 으로 정규화한다.
        return aggregate != null ? aggregate : AdminFeeMatchAggregate.EMPTY;
    }

    /**
     * 이상징후 FA-02·FA-04 — 기간 내 정정된 납부의 정정 시각과 대상 청구 마감일.
     * 두 Rule 이 같은 행 집합을 세므로 "정정 3건인데 마감 후 정정이 4건" 같은 자기모순이 날 수 없다.
     *
     * <p>ponytail: 건수만 필요한 FA-02 까지 행을 실어 오는 이유는 FA-04 가 컬럼 간 비교(시각 vs 날짜)라
     * 어차피 Java 판정이 필요하기 때문이다. 한 동아리·수십일 창의 정정 건수라 행이 적다 —
     * 정정이 수천 건 나오는 규모가 되면 FA-02 는 count 쿼리로 떼어낸다.
     */
    public List<AdminFeeVoidedPaymentDue> findVoidedPaymentDues(Long clubId, AdminFeePeriod period) {
        return queryFactory
                .select(Projections.constructor(AdminFeeVoidedPaymentDue.class,
                        payment.voidedAt, feeBill.dueDate))
                .from(payment)
                .join(feeBill).on(feeBill.id.eq(payment.feeBillId), feeBill.clubId.eq(clubId))
                .where(payment.status.eq(PaymentStatus.VOIDED), voidedGoe(period), voidedLt(period))
                .fetch();
    }

    /** 이상징후 FA-03 의 분모 — 기간 내 발행 청구 수. 나중에 취소된 청구도 발행은 발행이라 포함한다. */
    public long countIssuedBills(Long clubId, AdminFeePeriod period) {
        Long issuedCount = queryFactory
                .select(feeBill.count())
                .from(feeBill)
                .where(feeBill.clubId.eq(clubId), createdGoe(period), createdLt(period))
                .fetchOne();
        return issuedCount == null ? 0L : issuedCount;
    }

    /**
     * 이상징후 FA-03 의 분자 — 기간 내 취소된 청구 수.
     * 취소 시각은 {@code updated_at} 근사다 — 취소(CANCELLED)는 종단 상태라 그 뒤 수정이 없어
     * 마지막 수정 시각이 곧 취소 시각이다. 취소 시각 컬럼이 따로 생기면 그 컬럼으로 옮긴다.
     */
    public long countCancelledBills(Long clubId, AdminFeePeriod period) {
        Long cancelledCount = queryFactory
                .select(feeBill.count())
                .from(feeBill)
                .where(feeBill.clubId.eq(clubId), feeBill.status.eq(FeeStatus.CANCELLED),
                        updatedGoe(period), updatedLt(period))
                .fetchOne();
        return cancelledCount == null ? 0L : cancelledCount;
    }

    /** 콘솔 필터 → 파생 조건(스펙 §7.5). 마감 당일은 아직 연체가 아니라 미납이다. */
    private BooleanExpression filterCondition(AdminFeeBillFilter filter, LocalDate today) {
        if (filter == null) {
            return null;
        }
        return switch (filter) {
            case PAID -> feeBill.status.eq(FeeStatus.PAID);
            case UNPAID -> unpaidRemainder().and(feeBill.dueDate.goe(today));
            case OVERDUE -> overdueCondition(today);
            case CANCELLED -> feeBill.status.eq(FeeStatus.CANCELLED);
        };
    }

    /** q — 회원명 부분 일치(대소문자 무시)·학번 prefix(AdminUserApi 검색 규칙 미러). */
    private BooleanExpression billSearchCondition(String q) {
        if (!StringUtils.hasText(q)) {
            return null;
        }
        return user.name.containsIgnoreCase(q).or(user.studentId.startsWith(q));
    }

    /**
     * 응답 행의 연체 배지 값. 필터(OVERDUE)와 <b>같은 식</b>을 재사용하므로 필터 결과와 배지가 어긋날 수 없다 —
     * 파생 규칙을 SQL 과 Java 양쪽에 각각 두면 한쪽만 고쳐 갈라지기 쉬워 한 곳으로 모았다.
     * 완납·취소 청구는 마감이 지나도 false 다.
     */
    private BooleanExpression overdueFlag(LocalDate today) {
        return new CaseBuilder().when(overdueCondition(today)).then(true).otherwise(false);
    }

    private BooleanExpression overdueCondition(LocalDate today) {
        return unpaidRemainder().and(feeBill.dueDate.lt(today));
    }

    /** 미납 잔여 = 완납·취소가 아닌 상태. 연체 여부는 여기에 마감일 조건을 덧붙여 가른다. */
    private BooleanExpression unpaidRemainder() {
        return feeBill.status.in(FeeStatus.PENDING, FeeStatus.PARTIAL_PAID, FeeStatus.OVERDUE);
    }

    private OrderSpecifier<?>[] orderOf(AdminFeeBillSort sort) {
        // 집계·동률에서 페이지 간 순서가 흔들리지 않도록 id 로 고정한다.
        return switch (sort == null ? AdminFeeBillSort.LATEST : sort) {
            case LATEST -> new OrderSpecifier<?>[]{feeBill.createdAt.desc(), feeBill.id.desc()};
            case DUE -> new OrderSpecifier<?>[]{feeBill.dueDate.asc(), feeBill.id.asc()};
            case AMOUNT -> new OrderSpecifier<?>[]{feeBill.amount.desc(), feeBill.id.desc()};
        };
    }

    /** 미납 잔여(PENDING·PARTIAL_PAID·OVERDUE)를 마감일 조건으로 갈라 센다. */
    private NumberExpression<Long> remainderCount(BooleanExpression dueDateCondition) {
        return new CaseBuilder()
                .when(unpaidRemainder().and(dueDateCondition)).then(1L).otherwise(0L)
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

    /** 청구 취소 시각 근사(updated_at)도 created_at 과 같은 JVM 존 벽시계라 같은 경계를 쓴다. */
    private BooleanExpression updatedGoe(AdminFeePeriod period) {
        return period.createdFrom() == null ? null : feeBill.updatedAt.goe(period.createdFrom());
    }

    private BooleanExpression updatedLt(AdminFeePeriod period) {
        return period.createdTo() == null ? null : feeBill.updatedAt.lt(period.createdTo());
    }

    /** 거래 시각은 paid_at 과 같은 KST 벽시계라 기간의 KST 경계를 쓴다(created_at 경계가 아니다). */
    private BooleanExpression transactionGoe(AdminFeePeriod period) {
        return period.paidFrom() == null ? null : bankTransaction.transactionAt.goe(period.paidFrom());
    }

    private BooleanExpression transactionLt(AdminFeePeriod period) {
        return period.paidTo() == null ? null : bankTransaction.transactionAt.lt(period.paidTo());
    }

    /** 정정 시각도 seoulClock 으로 기록되는 KST 벽시계다(/TIMEZONE.md 대응표). */
    private BooleanExpression voidedGoe(AdminFeePeriod period) {
        return period.paidFrom() == null ? null : payment.voidedAt.goe(period.paidFrom());
    }

    private BooleanExpression voidedLt(AdminFeePeriod period) {
        return period.paidTo() == null ? null : payment.voidedAt.lt(period.paidTo());
    }

    private BooleanExpression statusEq(PaymentStatus status) {
        return status == null ? null : payment.status.eq(status);
    }

    /** 납부 기간 경계는 KST 벽시계로 적재된 paid_at 기준이다(발행일 기준인 청구와 컬럼이 다르다). */
    private BooleanExpression paidGoe(AdminFeePeriod period) {
        return period.paidFrom() == null ? null : payment.paidAt.goe(period.paidFrom());
    }

    private BooleanExpression paidLt(AdminFeePeriod period) {
        return period.paidTo() == null ? null : payment.paidAt.lt(period.paidTo());
    }
}
