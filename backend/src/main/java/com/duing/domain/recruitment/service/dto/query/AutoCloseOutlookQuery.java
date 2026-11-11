package com.duing.domain.recruitment.service.dto.query;

import java.time.LocalDate;

/**
 * 기간이 끝났는데 OPEN 인 모집(만료-OPEN)의 자동 마감 전망(#1572·#1583) — 잡의 마감 판정과 화면 안내·배지가 이 한 값을 본다.
 * 조립 규칙(만료-OPEN 판정·유예 경계)은 {@code RecruitmentAutoClosePolicy#outlook} 에 있다.
 *
 * <p>{@code gracePeriodOver} 는 서버의 '오늘'로 판정해 내려 준다 — 화면이 기기 시계로 날짜를 비교하면 표시 상태
 * ({@code displayStatus})처럼 기기마다 판정이 갈린다(#896).
 *
 * @param closesOn                  막는 것이 없을 때 자동 마감되는 첫날(KST) — 이날 00:40 실행이 닫는다
 * @param gracePeriodOver           오늘 ≥ closesOn
 * @param undecidedApplicationCount 결과 없는 지원 수(지원 완료·보류·면접 대기, 탈퇴한 지원자 제외)
 * @param inProgressRoundCount      결과를 기다리는 면접 대상(제외 안 됨·결과 없음·지원 삭제와 지원자 탈퇴 아님)이 남은 진행 중 면접 라운드 수
 *                                  (초안·응답 수집·배정 중)
 */
public record AutoCloseOutlookQuery(
        LocalDate closesOn,
        boolean gracePeriodOver,
        long undecidedApplicationCount,
        long inProgressRoundCount
) {

    public boolean blocked() {
        return undecidedApplicationCount > 0 || inProgressRoundCount > 0;
    }

    /** 잡이 지금 닫을 수 있는가 — 유예가 끝났고 막는 것이 없다. */
    public boolean closable() {
        return gracePeriodOver && !blocked();
    }
}
