package com.duing.domain.recruitment.service.dto.query;

import java.time.Instant;

/**
 * 관리자 모집 목록 항목 — 공통 행에 미처리 지원서와 운영진 접속을 얹는다. 상세는 이 값을 싣지 않는다.
 *
 * <p>미처리 두 값은 외부 폼 모집이면 비어 있다(지원 데이터가 없으므로 0 이 아니라 해당 없음 — 지원자 수와 같은 규칙).
 * 자체 폼 모집은 미처리가 없으면 0건·시각 없음이다. 운영진 접속은 회장·임원의 세션 사용(seoul regime)과
 * 로그인(system regime)을 각각 절대시각으로 바꾼 뒤 늦은 값이고, 운영진이나 기록이 없으면 비어 있다.
 */
public record AdminRecruitmentListItem(
        AdminRecruitmentRow recruitmentRow,
        Long pendingApplicationCount,
        Instant oldestPendingSubmittedAt,
        Instant operatorsLastActiveAt
) {
}
