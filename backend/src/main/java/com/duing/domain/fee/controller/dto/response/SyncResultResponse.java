package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.SyncResult;

/**
 * 거래 동기화 결과 응답. 적재 건수만 담으며, 인증정보(계좌 비번·주민번호)는 어떤 필드에도 포함되지 않는다.
 */
public record SyncResultResponse(int fetched, int newlyStored, int autoMatched, int pendingReview) {

    public static SyncResultResponse from(SyncResult result) {
        return new SyncResultResponse(
                result.fetched(), result.newlyStored(), result.autoMatched(), result.pendingReview());
    }
}
