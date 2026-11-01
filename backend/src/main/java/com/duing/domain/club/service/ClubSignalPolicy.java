package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.query.ClubSignalCutoffs;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.RecruitmentAutoClosePolicy;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 총동연 동아리 목록 신호·홈 동아리 현황 카드의 기준 시각과 끝난 날 규칙의 단일 지점(스펙 §4·§5).
 * <p>결과 대기 유예는 {@link RecruitmentAutoClosePolicy#endedBefore} 를 쓴다 — 자동 마감 유예를 바꾸면 이 신호도 함께 바뀐다(의도).
 * <p>운영진 접속 창({@link #OPERATOR_INACTIVE_DAYS}) ≤ 세션 보존 일수(AuthSessionCleanupJob — 폐기·만료 30일 뒤 물리 삭제)여야
 * 창 안의 사용 기록이 남는다. 접속 창을 늘리면 세션 보존도 함께 본다.
 */
public final class ClubSignalPolicy {

    /** 신청일(KST)이 오늘 − 이 일수보다 앞인 대기 신청이 있으면 가입 대기 신호다. */
    public static final int JOIN_REQUEST_WAITING_DAYS = 7;
    /** 운영진 접속이 지금 − 이 일수보다 오래면 미접속 신호다 — 프론트 operatorActivity.ts 의 OPERATOR_INACTIVE_DAYS 와 같은 값. */
    public static final int OPERATOR_INACTIVE_DAYS = 30;

    private ClubSignalPolicy() {
    }

    /**
     * 한 순간에서 네 기준을 만든다 — {@code clock.instant()} 를 한 번만 읽어 목록 한 번·집계 한 번 안의 문장들이 같은 기준을 쓴다.
     * 오늘·세션 기준은 clock 의 존(seoulClock = KST), 로그인 기준은 저장 존(JVM 기본 존)으로 만든다 — prod(JVM=UTC)에서 9시간 어긋나지 않게.
     */
    public static ClubSignalCutoffs cutoffs(Clock clock) {
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, clock.getZone());
        return new ClubSignalCutoffs(
                RecruitmentAutoClosePolicy.endedBefore(today),
                TimeMapper.seoulToSystemWallClock(today.minusDays(JOIN_REQUEST_WAITING_DAYS).atStartOfDay()),
                LocalDateTime.ofInstant(now, clock.getZone()).minusDays(OPERATOR_INACTIVE_DAYS),
                LocalDateTime.ofInstant(now, ZoneId.systemDefault()).minusDays(OPERATOR_INACTIVE_DAYS));
    }

    /**
     * 모집 하나의 끝난 날(스펙 §4-1) — ClubRepositoryImpl#recruitmentEndedBefore 술어의 Java 판이다. 바꿀 때 함께 바꾸고 ClubSignalPolicyTest 가 묶는다.
     * <ul>
     *   <li>CLOSED: 값이 있는 것 중 이른 날 — closed_at 의 날짜(seoul regime 이라 toLocalDate() 가 KST 날짜)와 end_date. 둘 다 없으면 start_date.</li>
     *   <li>OPEN: end_date. closed_at 은 보지 않는다(방어 — CLOSED 는 되돌릴 수 없다). end_date 가 없으면(상시모집) 아직 끝나지 않았다 → null.</li>
     * </ul>
     * <p>답변 파기 앵커(ApplicationRepository·ApplicationDraftRepository 의 {@code LEAST(closed_at::date, end_date)})와 다르다 —
     * 저쪽은 상태 무관·start_date 대체 없음, 이쪽은 CLOSED 만 start_date 로 대체하고 OPEN 은 closed_at 을 무시한다. 바꿀 때 함께 본다.
     */
    public static LocalDate endedOn(RecruitmentStatus status, LocalDateTime closedAt, LocalDate endDate, LocalDate startDate) {
        if (status != RecruitmentStatus.CLOSED) {
            return endDate;
        }
        LocalDate closedOn = closedAt == null ? null : closedAt.toLocalDate();
        if (closedOn == null) {
            return endDate == null ? startDate : endDate;
        }
        if (endDate == null) {
            return closedOn;
        }
        return closedOn.isBefore(endDate) ? closedOn : endDate;
    }
}
