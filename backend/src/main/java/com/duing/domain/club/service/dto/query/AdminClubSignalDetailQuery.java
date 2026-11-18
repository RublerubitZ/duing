package com.duing.domain.club.service.dto.query;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 총동연 신호 목록 행의 재료(동아리 신호 스펙 §6-1) — signal 을 보낸 요청에만 행마다 객체가 있다.
 * 신호와 무관한 하위 레코드는 null(NO_RECORD·OPERATOR_INACTIVE 는 둘 다 null)이고, 행 조회와 재료 조회 사이에 처리돼 재료가 없으면
 * 그 하위 레코드도 null 이다. 운영진 접속은 저장소가 null 로 두고 서비스가 {@link #withOperatorsLastActiveAt} 로 채운다.
 *
 * @param operatorsLastActiveAt 운영진(회장·임원)의 세션 사용·로그인 중 늦은 절대시각(OperatorActivityRow#lastActiveAt). 기록 없으면 null
 */
public record AdminClubSignalDetailQuery(
        Instant operatorsLastActiveAt,
        ResultWaiting resultWaiting,
        JoinRequestWaiting joinRequestWaiting
) {

    /**
     * @param oldestEndedOn    그 동아리 신호 모집 중 가장 이른 끝난 날(ClubSignalPolicy#endedOn — 신호 모집은 항상 non-null)
     * @param recruitmentCount 그 동아리 신호 모집 수
     * @param applicationCount 그 동아리 신호 모집들의 결과 미확정 지원 합(지원서 단위) — 홈 카드 resultWaiting.applicationCount 와 같은 정의
     */
    public record ResultWaiting(Long oldestRecruitmentId, String oldestRecruitmentTitle, LocalDate oldestEndedOn,
                                long recruitmentCount, long applicationCount) {
    }

    /**
     * @param requestCount      그 동아리 대기 신청 전부(7일 안 신청 포함) — 홈 카드 joinRequestWaiting.requestCount 와 같은 정의
     * @param oldestRequestedAt 가장 오래된 대기 신청의 created_at — system regime 벽시계(응답 from() 이 Instant 로 바꾼다)
     */
    public record JoinRequestWaiting(long requestCount, LocalDateTime oldestRequestedAt) {
    }

    public AdminClubSignalDetailQuery withOperatorsLastActiveAt(Instant lastActiveAt) {
        return new AdminClubSignalDetailQuery(lastActiveAt, resultWaiting, joinRequestWaiting);
    }
}
