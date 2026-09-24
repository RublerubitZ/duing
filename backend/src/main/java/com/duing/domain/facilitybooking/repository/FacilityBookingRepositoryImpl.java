package com.duing.domain.facilitybooking.repository;

import static com.duing.domain.club.entity.QClub.club;
import static com.duing.domain.facilitybooking.entity.QFacilityBooking.facilityBooking;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingQueueSort;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.jpa.impl.JPAQuery;
import com.querydsl.jpa.impl.JPAQueryFactory;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

@RequiredArgsConstructor
public class FacilityBookingRepositoryImpl implements FacilityBookingRepositoryCustom {

    private final JPAQueryFactory queryFactory;

    @Override
    public Page<FacilityBooking> searchForAdmin(AdminBookingSearchCondition condition, Pageable pageable) {
        JPAQuery<FacilityBooking> query = queryFactory.selectFrom(facilityBooking)
                .where(statusEquals(condition.status()),
                        facilityEquals(condition.facilityId()),
                        dateFrom(condition.dateFrom()),
                        dateTo(condition.dateTo()));
        if (condition.sort() == AdminBookingQueueSort.CLUB) {
            // 동아리 이름은 연관관계 없이 clubId 로만 이어져 있다 — 정렬에만 쓰는 조인이라 CLUB 일 때만 붙인다.
            // club.id 가 PK 라 행이 배수화되지 않으므로 count 쿼리는 조인 없이 그대로 둔다.
            query.leftJoin(club).on(club.id.eq(facilityBooking.clubId));
        }
        List<FacilityBooking> content = query
                .orderBy(orderBy(condition))
                .offset(pageable.getOffset())
                .limit(pageable.getPageSize())
                .fetch();
        Long total = queryFactory.select(facilityBooking.count())
                .from(facilityBooking)
                .where(statusEquals(condition.status()),
                        facilityEquals(condition.facilityId()),
                        dateFrom(condition.dateFrom()),
                        dateTo(condition.dateTo()))
                .fetchOne();
        return new PageImpl<>(content, pageable, total != null ? total : 0L);
    }

    /**
     * 기본 뷰(PENDING 큐)는 오래된 순으로 정렬한다(§9.7) — 오래 대기한 신청을 먼저 처리하도록 createdAt 오름차순.
     * 그 외 상태(및 status 무필터)는 최근 활동을 먼저 보는 기존 최신순을 유지한다.
     * USAGE_ASC/USAGE_DESC 는 이용일 → 시작 시각을 앞에 붙이고, 동일 이용일시는 이 기본 순서로 가른다.
     * CREATED_DESC 는 탭과 무관하게 신청일시 내림차순, CLUB 은 동아리 이름 가나다순 뒤 이용일시 오름차순이다.
     * 어느 기준이든 비유일 컬럼이라 id 를 마지막에 붙여 페이지 경계에서 순서를 결정적으로 고정한다.
     */
    private OrderSpecifier<?>[] orderBy(AdminBookingSearchCondition condition) {
        OrderSpecifier<?>[] byStatus = condition.status() == BookingStatus.PENDING
                ? new OrderSpecifier<?>[] {facilityBooking.createdAt.asc(), facilityBooking.id.asc()}
                : new OrderSpecifier<?>[] {facilityBooking.createdAt.desc(), facilityBooking.id.desc()};
        return switch (condition.sort()) {
            case DEFAULT -> byStatus;
            case CREATED_DESC -> new OrderSpecifier<?>[] {facilityBooking.createdAt.desc(), facilityBooking.id.desc()};
            // 삭제 동아리는 @SQLRestriction 이 ON 절에 붙어 이름이 null 로 온다 — 맨 뒤로 보낸다.
            case CLUB -> new OrderSpecifier<?>[] {club.name.asc().nullsLast(),
                    facilityBooking.reservationDate.asc(), facilityBooking.startTime.asc(), facilityBooking.id.asc()};
            case USAGE_ASC -> new OrderSpecifier<?>[] {
                    facilityBooking.reservationDate.asc(), facilityBooking.startTime.asc(), byStatus[0], byStatus[1]};
            case USAGE_DESC -> new OrderSpecifier<?>[] {
                    facilityBooking.reservationDate.desc(), facilityBooking.startTime.desc(), byStatus[0], byStatus[1]};
        };
    }

    private BooleanExpression statusEquals(BookingStatus status) {
        return status != null ? facilityBooking.status.eq(status) : null;
    }

    private BooleanExpression facilityEquals(Long facilityId) {
        return facilityId != null ? facilityBooking.facilityId.eq(facilityId) : null;
    }

    private BooleanExpression dateFrom(LocalDate from) {
        return from != null ? facilityBooking.reservationDate.goe(from) : null;
    }

    private BooleanExpression dateTo(LocalDate to) {
        return to != null ? facilityBooking.reservationDate.loe(to) : null;
    }
}
