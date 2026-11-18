package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

/**
 * 기간이 끝났는데 OPEN 인 모집의 자동 마감 전망 — 운영진 통계 요약과 총동연 모집 목록이 같은 값을 싣는다(#1572·#1583).
 * 화면은 날짜를 비교하지 않는다 — 유예가 끝났는지는 서버가 판정한 {@code gracePeriodOver} 를 그대로 쓴다.
 */
@Schema(description = "자동 마감 전망. 기간이 끝났지만 아직 OPEN 인 모집에만 있고, 그 밖의 모집이나 자동 마감이 꺼져 있으면 null 이다.")
public record AutoCloseOutlookResponse(
        @Schema(description = "막는 것이 없을 때 자동 마감되는 첫날(KST 날짜) — 이날 새벽 0시 40분 실행이 닫는다. 종료일 + 8일.",
                example = "2026-12-08")
        LocalDate closesOn,
        @Schema(description = "오늘(서버, KST) 이 closesOn 이후인지 — 유예 7일이 끝났는지", example = "true")
        boolean gracePeriodOver,
        @Schema(description = "자동 마감을 막는 결과 없는 지원 수(지원 완료·보류·면접 대기, 탈퇴한 지원자 제외)", example = "0")
        long undecidedApplicationCount,
        @Schema(description = "자동 마감을 막는 진행 중 면접 라운드 수(초안·응답 수집·배정 중) — 결과를 기다리는 면접 대상(제외되지 않았고 결과가 없으며 철회·탈퇴한 지원자가 아닌 멤버)이 남은 라운드만 센다", example = "1")
        long inProgressRoundCount
) {

    public static AutoCloseOutlookResponse from(AutoCloseOutlookQuery outlook) {
        if (outlook == null) {
            return null;
        }
        return new AutoCloseOutlookResponse(outlook.closesOn(), outlook.gracePeriodOver(),
                outlook.undecidedApplicationCount(), outlook.inProgressRoundCount());
    }
}
