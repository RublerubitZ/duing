package com.duing.domain.recruitment.service;

import java.time.LocalDate;

/**
 * 기간 종료 모집 자동 마감의 유예 기준 단일 지점 — 후보 조회와 잠금 아래 재확인이 같은 기준을 쓴다.
 * 마감 조건 전체는 {@link RecruitmentAutoCloseService} 에 있다.
 *
 * <p>유예 {@link #GRACE_DAYS}일은 미처리 지원서 기준({@code PendingApplicationPolicy.PENDING_DAYS})과 값이 같지만
 * 의미가 달라 따로 둔다 — 이쪽은 종료일 뒤 운영진이 종료일을 연장(재개)하거나 평가를 마칠 수 있는 기간이다.
 */
public final class RecruitmentAutoClosePolicy {

    /** 종료일 다음 날부터 이 기간이 지나야 자동 마감 대상이다(종료일 10/1 → 10/9 부터). */
    public static final int GRACE_DAYS = 7;

    private RecruitmentAutoClosePolicy() {
    }

    /** 종료일이 이 날짜보다 앞이면(미포함) 유예가 끝났다. */
    public static LocalDate endedBefore(LocalDate today) {
        return today.minusDays(GRACE_DAYS);
    }

    /**
     * 막는 것이 없을 때 자동 마감되는 첫날 — 이날 00:40 실행이 닫는다. {@link #endedBefore} 와 같은 경계다
     * (오늘 ≥ closesOn ⇔ 종료일 < endedBefore(오늘)). 화면의 자동 마감 날짜 안내가 이 값을 쓴다.
     */
    public static LocalDate closesOn(LocalDate endDate) {
        return endDate.plusDays(GRACE_DAYS + 1L);
    }
}
