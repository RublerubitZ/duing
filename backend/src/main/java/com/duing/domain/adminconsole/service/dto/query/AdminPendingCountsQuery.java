package com.duing.domain.adminconsole.service.dto.query;

/** 관리자 콘솔 미처리 건수 집계 결과. 총합은 응답 변환 시점이 아니라 여기서 확정한다. */
public record AdminPendingCountsQuery(
        long clubApproval,
        long facilityBooking,
        long inquiryUnanswered,
        long promotionRequest,
        long reportUnresolved,
        long leaderSuccession,
        long stalePendingRecruitment,
        long totalPendingCount
) {

    public static AdminPendingCountsQuery of(
            long clubApproval,
            long facilityBooking,
            long inquiryUnanswered,
            long promotionRequest,
            long reportUnresolved,
            long leaderSuccession,
            long stalePendingRecruitment
    ) {
        long totalPendingCount = clubApproval + facilityBooking + inquiryUnanswered
                + promotionRequest + reportUnresolved + leaderSuccession + stalePendingRecruitment;
        return new AdminPendingCountsQuery(clubApproval, facilityBooking, inquiryUnanswered,
                promotionRequest, reportUnresolved, leaderSuccession, stalePendingRecruitment, totalPendingCount);
    }
}
