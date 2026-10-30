package com.duing.global.jobrun;

/**
 * 스케줄 잡 한 번의 실행 결과.
 *
 * <p>값은 {@code scheduled_job_run.last_outcome} 에 저장되고 조회가 {@code @Enumerated(STRING)} 으로 읽는다 — 값을 더할 때는
 * 모르는 값을 견디는 읽기를 한 릴리스 먼저 내보낸다. 그러지 않으면 새 이미지가 쓴 줄을 롤백한 옛 이미지가 읽다 자동 작업 상태 API 전체가 500 이 된다.
 */
public enum JobRunOutcome {
    SUCCESS,
    PARTIAL,
    FAILED;

    /** 끝까지 돈 실행의 결과 — 실패 건수가 있으면 일부 실패. 예외로 끝난 실행은 호출자가 FAILED 를 직접 넘긴다. */
    public static JobRunOutcome of(int failedCount) {
        return failedCount > 0 ? PARTIAL : SUCCESS;
    }
}
