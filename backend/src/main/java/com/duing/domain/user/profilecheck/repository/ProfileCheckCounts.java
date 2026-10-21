package com.duing.domain.user.profilecheck.repository;

/** 정보 확인 대상 수와 그중 해당 학기 확인 기록이 있는 수. 두 값을 같은 대상 조건으로 세므로 확인 완료 ≤ 대상이다. */
public record ProfileCheckCounts(long targetCount, long confirmedCount) {

    public long unconfirmedCount() {
        return targetCount - confirmedCount;
    }
}
