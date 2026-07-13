package com.duing.domain.facilitybooking.repository;

import static com.duing.domain.facilitybooking.entity.QFacilityBooking.facilityBooking;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.BooleanExpression;
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
        List<FacilityBooking> content = queryFactory.selectFrom(facilityBooking)
                .where(statusEquals(condition.status()),
                        facilityEquals(condition.facilityId()),
                        dateFrom(condition.dateFrom()),
                        dateTo(condition.dateTo()))
                .orderBy(orderBy(condition.status()))
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
     * createdAt 은 비유일이라 id 를 2차 정렬로 붙여 페이지 경계에서 순서를 결정적으로 고정한다.
     */
    private OrderSpecifier<?>[] orderBy(BookingStatus status) {
        if (status == BookingStatus.PENDING) {
            return new OrderSpecifier<?>[] {facilityBooking.createdAt.asc(), facilityBooking.id.asc()};
        }
        return new OrderSpecifier<?>[] {facilityBooking.createdAt.desc(), facilityBooking.id.desc()};
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
