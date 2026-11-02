package com.duing.domain.adminconsole.service.dto.query;

import java.time.LocalDate;

/**
 * 총동연 주간 브리핑 — 고른 주(KST 월~일)에 접수·처리한 일, 그 주 일요일 하루 끝 남은 대기, 모집·회비·공지·정보 확인 활동.
 * endPending·pendingRecordStartedOn 은 기록이 없으면 null 이다(0 과 다르다).
 */
public record AdminWeeklyBriefingQuery(
        WeeklyFlows flow,
        AdminPendingCountsQuery endPending,
        LocalDate pendingRecordStartedOn,
        FirstAnswer inquiryFirstAnswer,
        long federationNoticeCount,
        RecruitmentActivity recruitment,
        FeeActivity fee,
        long profileCheckConfirmedCount
) {

    /** 다섯 업무(신고·문의·시설 예약·홍보·회장 승계)의 접수·처리 — 홈 처리 대기 추이의 recentFlow 와 같은 열·규칙. */
    public record WeeklyFlows(Flow report, Flow inquiry, Flow facilityBooking, Flow promotionRequest,
                              Flow leaderSuccession) {
    }

    public record Flow(long receivedCount, long handledCount) {
    }

    /** 그 주에 나간 답변 수와 접수부터 답변까지 평균(분, 반올림). 답변이 없으면 averageMinutes 는 null. */
    public record FirstAnswer(long answerCount, Long averageMinutes) {
    }

    /** 새로 등록한 모집·모집 기간이 끝난 모집·제출된 지원서. */
    public record RecruitmentActivity(long createdCount, long endedCount, long applicationCount) {
    }

    /** 회원 청구·청구한 동아리·회원 납부 기록·납부 정정·입금 계좌를 바꾸거나 지운 동아리. */
    public record FeeActivity(long billCount, long billedClubCount, long paymentCount, long voidedPaymentCount,
                              long accountChangedClubCount) {
    }
}
