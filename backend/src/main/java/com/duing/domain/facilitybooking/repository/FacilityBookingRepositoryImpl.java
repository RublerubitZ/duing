package com.duing.domain.facilitybooking.repository;

import static com.duing.domain.facilitybooking.entity.QFacilityBooking.facilityBooking;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
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
                // createdAt 은 비유일 — id 를 2차 정렬로 붙여 페이지 경계에서 순서를 결정적으로 고정한다.
                .orderBy(facilityBooking.createdAt.desc(), facilityBooking.id.desc())
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
