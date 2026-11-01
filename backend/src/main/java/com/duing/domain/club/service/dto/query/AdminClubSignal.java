package com.duing.domain.club.service.dto.query;

/**
 * 총동연 동아리 목록 신호 필터 — 요청 값으로만 쓰고 저장하지 않는다(롤백해도 남는 데이터가 없다, 스펙 §1 성공 기준 4).
 * 판정 식은 ClubRepositoryImpl#signalFilter, 기준 시각은 ClubSignalPolicy#cutoffs 한 곳이다.
 * 값을 바꾸면 프론트 신호 이름 표(apps/web/app/admin/clubs/_lib/clubSignals.ts)도 함께 바꾼다.
 */
public enum AdminClubSignal {
    /** 지원 결과 미확정 — 끝난 날이 기준일(오늘 − 7)보다 앞선 모집에 결과 미확정 지원이 남았다(스펙 §4-1). */
    RESULT_WAITING,
    /** 가입 신청 7일 넘게 대기 — 신청일(KST)이 오늘 − 7 보다 앞선 대기 신청이 있다(스펙 §4-2). */
    JOIN_REQUEST_WAITING,
    /** 두잉 기록 없음(참고) — club_metric 행이 없거나 last_activity_at 이 null 이다(스펙 §4-3). 활동 평가 기준이 아니다. */
    NO_RECORD,
    /** 운영진 30일 넘게 미접속(참고) — 최근 로그인한 운영진도 최근 세션을 쓴 운영진도 없다(스펙 §4-4). */
    OPERATOR_INACTIVE
}
