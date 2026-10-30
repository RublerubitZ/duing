package com.duing.global.jobrun;

/** 스케줄 잡 한 번의 실행 결과. */
public enum JobRunOutcome {
    SUCCESS,
    PARTIAL,
    FAILED;

    /** 끝까지 돈 실행의 결과 — 실패 건수가 있으면 일부 실패. 예외로 끝난 실행은 호출자가 FAILED 를 직접 넘긴다. */
    public static JobRunOutcome of(int failedCount) {
        return failedCount > 0 ? PARTIAL : SUCCESS;
    }
}
