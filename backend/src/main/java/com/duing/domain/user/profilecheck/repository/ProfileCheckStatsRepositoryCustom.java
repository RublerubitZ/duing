package com.duing.domain.user.profilecheck.repository;

import com.duing.domain.user.profilecheck.entity.Semester;
import java.time.Instant;

public interface ProfileCheckStatsRepositoryCustom {

    /** 대상자(정지 아님·졸업생 아님·탈퇴 아님 — 역할 무관) 수와 그중 {@code semester} 확인 기록이 있는 수. */
    ProfileCheckCounts countTargetsAndConfirmed(Semester semester);

    /**
     * 기간(절대 시각, from 포함·to 미만)에 남은 학기 정보 확인 기록 수 — 대상자(정지·졸업생·탈퇴 제외) 것만.
     * 콘솔 확인 수의 주별 증가분이다(기록 = 사용자×학기라 학기 경계 주에는 한 사람이 두 번 셀 수 있다).
     */
    long countTargetConfirmationsBetween(Instant from, Instant to);
}
