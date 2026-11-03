package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.RecruitmentAutoClosePolicy;
import java.time.LocalDate;

/**
 * 기간이 끝났는데 OPEN 인 모집(만료-OPEN)의 자동 마감 전망(#1572·#1583) — 잡의 마감 판정과 화면 안내·배지가 이 한 값을 본다.
 *
 * <p>{@code gracePeriodOver} 는 서버의 '오늘'로 판정해 내려 준다 — 화면이 기기 시계로 날짜를 비교하면 표시 상태
 * ({@code displayStatus})처럼 기기마다 판정이 갈린다(#896).
 *
 * @param closesOn                  막는 것이 없을 때 자동 마감되는 첫날(KST) — 이날 00:40 실행이 닫는다
 * @param gracePeriodOver           오늘 ≥ closesOn
 * @param undecidedApplicationCount 결과 없는 지원 수(지원 완료·보류·면접 대기, 탈퇴한 지원자 제외)
 * @param inProgressRoundCount      진행 중 면접 라운드 수(초안·응답 수집·배정 중)
 */
public record AutoCloseOutlookQuery(
        LocalDate closesOn,
        boolean gracePeriodOver,
        long undecidedApplicationCount,
        long inProgressRoundCount
) {

    /** 만료-OPEN 이 아니면(마감·상시모집·기간 중·시작 전) null — 자동 마감과 상관없는 모집이다. */
    public static AutoCloseOutlookQuery assemble(Recruitment recruitment, LocalDate today,
                                                 long undecidedApplicationCount, long inProgressRoundCount) {
        if (!isExpiredOpen(recruitment, today)) {
            return null;
        }
        LocalDate closesOn = RecruitmentAutoClosePolicy.closesOn(recruitment.getEndDate());
        return new AutoCloseOutlookQuery(closesOn, !today.isBefore(closesOn),
                undecidedApplicationCount, inProgressRoundCount);
    }

    /**
     * 만료-OPEN 판정 — 화면의 {@code isRecruitmentExpiredOpen}(저장 상태 OPEN·표시 상태 CLOSED)과 같은 모양으로,
     * 표시 상태 판정({@link RecruitmentDisplayStatus#resolve})을 그대로 쓴다. 집계 쿼리를 부를지 정하는 데도 쓴다.
     */
    public static boolean isExpiredOpen(Recruitment recruitment, LocalDate today) {
        return recruitment.getStatus() == RecruitmentStatus.OPEN
                && RecruitmentDisplayStatus.resolve(recruitment.getStatus(), recruitment.getStartDate(),
                        recruitment.getEndDate(), today) == RecruitmentDisplayStatus.CLOSED;
    }

    public boolean blocked() {
        return undecidedApplicationCount > 0 || inProgressRoundCount > 0;
    }

    /** 잡이 지금 닫을 수 있는가 — 유예가 끝났고 막는 것이 없다. */
    public boolean closable() {
        return gracePeriodOver && !blocked();
    }
}
