package com.duing.domain.user.profilecheck.repository;

import com.duing.domain.user.profilecheck.entity.Semester;

public interface ProfileCheckStatsRepositoryCustom {

    /** 대상자(정지 아님·졸업생 아님·탈퇴 아님 — 역할 무관) 수와 그중 {@code semester} 확인 기록이 있는 수. */
    ProfileCheckCounts countTargetsAndConfirmed(Semester semester);
}
