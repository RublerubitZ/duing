package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FeeActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FirstAnswer;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.RecruitmentActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.WeeklyFlows;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(description = "총동연 주간 브리핑 — 고른 주(KST 월 00:00 ~ 다음 월 00:00)의 접수·처리·남은 대기·활동")
public record AdminWeeklyBriefingResponse(
        @Schema(description = "다섯 업무의 접수·처리 건수(홈 처리 대기 추이의 최근 7일과 같은 열, 기간만 다르다)")
        WeeklyFlowsResponse flow,

        @Schema(description = "그 주 일요일 하루 끝 남은 대기 — 홈 처리 대기 추이의 같은 날 기록 그대로. 기록이 없으면 null",
                nullable = true)
        AdminPendingCountsResponse endPending,

        @Schema(description = "남은 대기 기록이 처음 시작된 날(KST 날짜). 기록이 하나도 없으면 null",
                nullable = true, example = "2026-11-04")
        LocalDate pendingRecordStartedOn,

        @Schema(description = "1:1 문의 첫 답변 — 그 주에 나간 답변 수와 접수부터 답변까지 평균(분)")
        WeeklyFirstAnswerResponse inquiryFirstAnswer,

        @Schema(description = "그 주에 쓴 총동연 공지 수(동아리 공지 제외)", example = "1")
        long federationNoticeCount,

        @Schema(description = "모집 활동")
        WeeklyRecruitmentResponse recruitment,

        @Schema(description = "회비 활동")
        WeeklyFeeResponse fee,

        @Schema(description = "그 주에 학기 정보 확인을 마친 콘솔 대상자 수(가입·프로필 저장 포함)", example = "37")
        long profileCheckConfirmedCount
) {

    public static AdminWeeklyBriefingResponse from(AdminWeeklyBriefingQuery query) {
        return new AdminWeeklyBriefingResponse(
                WeeklyFlowsResponse.from(query.flow()),
                query.endPending() == null ? null : AdminPendingCountsResponse.from(query.endPending()),
                query.pendingRecordStartedOn(),
                WeeklyFirstAnswerResponse.from(query.inquiryFirstAnswer()),
                query.federationNoticeCount(),
                WeeklyRecruitmentResponse.from(query.recruitment()),
                WeeklyFeeResponse.from(query.fee()),
                query.profileCheckConfirmedCount());
    }

    @Schema(description = "다섯 업무의 접수·처리")
    public record WeeklyFlowsResponse(
            WeeklyFlowResponse report,
            WeeklyFlowResponse inquiry,
            WeeklyFlowResponse facilityBooking,
            WeeklyFlowResponse promotionRequest,
            WeeklyFlowResponse leaderSuccession
    ) {
        static WeeklyFlowsResponse from(WeeklyFlows flows) {
            return new WeeklyFlowsResponse(WeeklyFlowResponse.from(flows.report()), WeeklyFlowResponse.from(flows.inquiry()),
                    WeeklyFlowResponse.from(flows.facilityBooking()), WeeklyFlowResponse.from(flows.promotionRequest()),
                    WeeklyFlowResponse.from(flows.leaderSuccession()));
        }
    }

    @Schema(description = "한 업무의 그 주 접수·처리 건수")
    public record WeeklyFlowResponse(
            @Schema(description = "그 주에 들어온 건수", example = "4") long receivedCount,
            @Schema(description = "그 주에 처리한 건수(문의는 답변·답변 없이 닫음, 시설 예약은 승인·반려)", example = "2")
            long handledCount
    ) {
        static WeeklyFlowResponse from(Flow flow) {
            return new WeeklyFlowResponse(flow.receivedCount(), flow.handledCount());
        }
    }

    @Schema(description = "1:1 문의 첫 답변")
    public record WeeklyFirstAnswerResponse(
            @Schema(description = "그 주에 나간 답변 수", example = "4") long answerCount,
            @Schema(description = "접수부터 답변까지 평균(분, 반올림). 답변이 없으면 null", nullable = true, example = "2580")
            Long averageMinutes
    ) {
        static WeeklyFirstAnswerResponse from(FirstAnswer firstAnswer) {
            return new WeeklyFirstAnswerResponse(firstAnswer.answerCount(), firstAnswer.averageMinutes());
        }
    }

    @Schema(description = "모집 활동")
    public record WeeklyRecruitmentResponse(
            @Schema(description = "그 주에 새로 등록한 모집 수(시작 전 등록 포함)", example = "3") long createdCount,
            @Schema(description = "모집 기간이 그 주(월~일)에 끝난 모집 수(상시모집 제외)", example = "2") long endedCount,
            @Schema(description = "그 주에 제출된 지원서 수(철회 제외)", example = "142") long applicationCount
    ) {
        static WeeklyRecruitmentResponse from(RecruitmentActivity recruitment) {
            return new WeeklyRecruitmentResponse(recruitment.createdCount(), recruitment.endedCount(),
                    recruitment.applicationCount());
        }
    }

    @Schema(description = "회비 활동")
    public record WeeklyFeeResponse(
            @Schema(description = "그 주에 발행한 회원 청구 수(취소 제외)", example = "120") long billCount,
            @Schema(description = "그 주에 청구를 발행한 동아리 수(취소 청구만 있는 동아리 제외)", example = "8") long billedClubCount,
            @Schema(description = "그 주에 입력한 납부 기록 수(나중에 정정된 납부 포함)", example = "95") long paymentCount,
            @Schema(description = "그 주에 정정한 납부 수", example = "2") long voidedPaymentCount,
            @Schema(description = "그 주에 입금 계좌를 바꾸거나 지운 동아리 수", example = "1") long accountChangedClubCount
    ) {
        static WeeklyFeeResponse from(FeeActivity fee) {
            return new WeeklyFeeResponse(fee.billCount(), fee.billedClubCount(), fee.paymentCount(),
                    fee.voidedPaymentCount(), fee.accountChangedClubCount());
        }
    }
}
