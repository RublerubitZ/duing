package com.duing.domain.club.service.dto.query;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 총동연 홈 동아리 현황(동아리 신호 스펙 §6-2) — 저장소 반환 타입이자 집계 서비스 반환 타입(club → adminconsole 역의존을 만들지 않는다).
 * 각 수는 목록 ?status=ACTIVE&signal=… 의 totalElements 와 같은 식이다. 묶음마다 세 숫자는 한 문장에서 나오고,
 * 묶음 사이는 별도 문장이라 같은 스냅숏이 아닐 수 있다.
 */
public record ClubSignalSummaryQuery(
        long activeClubCount,
        ResultWaiting resultWaiting,
        JoinRequestWaiting joinRequestWaiting,
        long noRecordClubCount,
        long operatorInactiveClubCount
) {

    /** @param oldestEndedOn 신호 모집 중 가장 이른 끝난 날 — clubCount 가 0 일 때만, 그리고 그때 반드시 null */
    public record ResultWaiting(long clubCount, long applicationCount, LocalDate oldestEndedOn) {
    }

    /** @param oldestRequestedAt 신호 동아리 대기 신청 중 가장 오래된 created_at(system regime) — clubCount 가 0 일 때만, 그리고 그때 반드시 null */
    public record JoinRequestWaiting(long clubCount, long requestCount, LocalDateTime oldestRequestedAt) {
    }
}
