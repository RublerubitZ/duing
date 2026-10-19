package com.duing.domain.user.profilecheck.entity;

import java.time.Clock;
import java.time.LocalDate;

/**
 * 학기 — (학년도, 1|2학기). 서울 날짜로 판정한다.
 *
 * <p>3~8월은 그해 1학기, 9~12월은 그해 2학기, 1~2월은 전년 2학기다. 법정 학년도가 3월 1일에 시작하므로
 * 1학기 경계는 3/1, 2학기 경계는 관례대로 9/1 이다. 운영진이 학기를 고르지 않게 해, 설정 실수로 확인 기록과
 * 노출 학기가 엇갈리는 경로를 없앤다.
 */
public record Semester(int year, int term) {

    public static final int FIRST_TERM = 1;
    public static final int SECOND_TERM = 2;

    private static final int FIRST_TERM_START_MONTH = 3;
    private static final int SECOND_TERM_START_MONTH = 9;

    public static Semester of(LocalDate seoulDate) {
        int month = seoulDate.getMonthValue();
        if (month >= SECOND_TERM_START_MONTH) {
            return new Semester(seoulDate.getYear(), SECOND_TERM);
        }
        if (month >= FIRST_TERM_START_MONTH) {
            return new Semester(seoulDate.getYear(), FIRST_TERM);
        }
        return new Semester(seoulDate.getYear() - 1, SECOND_TERM);
    }

    /**
     * 주입된 Clock(서울 존)의 오늘 학기. 요청마다 한 번만 계산해 넘긴다 — 자정 경계에서 한 요청 안의 판정이
     * 갈라지지 않게.
     */
    public static Semester current(Clock clock) {
        return of(LocalDate.now(clock));
    }

    public boolean isFirstTerm() {
        return term == FIRST_TERM;
    }
}
