package com.duing.domain.user.profilecheck.service;

import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.profilecheck.entity.Semester;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/** 학기별 정보 확인의 대상·학년 제안 규칙(스펙 §5.2). */
final class ProfileCheckPolicy {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private ProfileCheckPolicy() {
    }

    /**
     * 대상자 — 정지되지 않았고 졸업생이 아닌 회원이다. 역할과 무관해 총동연(관리자) 계정도 든다. 탈퇴자는 User 조회 조건(soft delete)이 이미 뺀다.
     * 대상 조건은 ProfileCheckStatsRepositoryImpl.countTargetsAndConfirmed 와 같아야 한다 — 콘솔 숫자가 팝업 노출과 어긋나지 않게.
     */
    static boolean isTarget(User user) {
        return user.isActive() && user.getGrade() != Grade.GRADUATED;
    }

    /**
     * 1학기에만 1~3학년에게 다음 학년을 제안한다(2학기는 같은 학년도라 학년이 바뀌지 않는다). 그해 1월 1일(서울) 0시
     * 이후 가입했거나 학년을 바꾼 회원에게는 제안하지 않는다 — 2월 OT 때 새 학년으로 가입한 신입생, 1~2월에 미리 학년을
     * 올린 회원에게 한 학년 더 올리라고 권하지 않게. {@code createdAt} 은 JPA 감사 값(JVM 존 벽시계)이라 경계도 같은 존으로
     * 옮겨 비교하고(운영 JVM = UTC), {@code gradeChangedAt} 은 절대시각이라 서울 경계의 절대시각과 비교한다.
     */
    static Grade suggestedGrade(Grade grade, LocalDateTime createdAt, Instant gradeChangedAt, Semester semester) {
        if (!semester.isFirstTerm()) {
            return null;
        }
        LocalDate yearStart = LocalDate.of(semester.year(), 1, 1);
        LocalDateTime winterBreakStart = TimeMapper.seoulToSystemWallClock(yearStart.atStartOfDay());
        if (!createdAt.isBefore(winterBreakStart)) {
            return null;
        }
        if (gradeChangedAt != null && !gradeChangedAt.isBefore(yearStart.atStartOfDay(SEOUL).toInstant())) {
            return null;
        }
        return switch (grade) {
            case FRESHMAN -> Grade.SOPHOMORE;
            case SOPHOMORE -> Grade.JUNIOR;
            case JUNIOR -> Grade.SENIOR;
            case SENIOR, ON_LEAVE, GRADUATED -> null;
        };
    }
}
