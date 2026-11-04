package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.SyncResult;
import java.time.LocalDate;

/**
 * 거래 동기화 결과 응답. 적재 건수와 이번 동기화에서 확인하지 못한 기간만 담으며, 인증정보(계좌 비번·주민번호)는 어떤 필드에도 포함되지 않는다.
 */
public record SyncResultResponse(int fetched, int newlyStored, int autoMatched, int pendingReview,
                                 LocalDate missedFrom, LocalDate missedTo) {

    public static SyncResultResponse from(SyncResult result) {
        return new SyncResultResponse(
                result.fetched(), result.newlyStored(), result.autoMatched(), result.pendingReview(),
                result.missedFrom(), result.missedTo());
    }
}
