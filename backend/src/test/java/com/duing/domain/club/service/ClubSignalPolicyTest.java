package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.service.dto.query.ClubSignalCutoffs;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 신호 기준 시각·끝난 날 규칙(스펙 §4-1·§5). 운영 JVM 처럼 기본 존을 UTC 로 두고,
 * KST 날짜와 UTC 날짜가 갈리는 시각(KST 2026-09-08 05:00 = UTC 09-07 20:00)으로 고정한다 — 로컬(KST)에서도 regime 실수가 드러난다.
 */
class ClubSignalPolicyTest {

    private static final Clock SEOUL_CLOCK = Clock.fixed(Instant.parse("2026-09-07T20:00:00Z"), ZoneId.of("Asia/Seoul"));

    private TimeZone originalDefaultZone;

    @BeforeEach
    void runAsProductionJvm() {
        originalDefaultZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    @Test
    @DisplayName("기준 네 값은 한 순간에서 만들고 결과·세션 기준은 KST, 가입 신청·로그인 기준은 저장 존(UTC) 벽시계다")
    void cutoffsAreBuiltFromOneInstantInEachRegime() {
        ClubSignalCutoffs cutoffs = ClubSignalPolicy.cutoffs(SEOUL_CLOCK);

        assertThat(cutoffs.resultEndedBefore()).as("KST 오늘 09-08 − 7").isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(cutoffs.joinRequestedBefore()).as("KST 09-01 00:00 를 UTC 벽시계로")
                .isEqualTo(LocalDateTime.of(2026, 8, 31, 15, 0));
        assertThat(cutoffs.operatorSessionUsedSince()).as("KST 지금 − 30일")
                .isEqualTo(LocalDateTime.of(2026, 8, 9, 5, 0));
        assertThat(cutoffs.operatorLoggedInSince()).as("UTC 지금 − 30일")
                .isEqualTo(LocalDateTime.of(2026, 8, 8, 20, 0));
    }

    @Test
    @DisplayName("기준 네 값은 시계를 한 번만 읽는다 — 읽을 때마다 하루씩 가는 시계로도 고정 시계와 같은 값이다")
    void cutoffsReadTheClockOnlyOnce() {
        Clock advancingClock = new Clock() {
            private Instant nextInstant = SEOUL_CLOCK.instant();

            @Override
            public ZoneId getZone() {
                return SEOUL_CLOCK.getZone();
            }

            @Override
            public Clock withZone(ZoneId zone) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Instant instant() {
                Instant currentInstant = nextInstant;
                nextInstant = nextInstant.plus(Duration.ofDays(1));
                return currentInstant;
            }
        };

        assertThat(ClubSignalPolicy.cutoffs(advancingClock)).isEqualTo(ClubSignalPolicy.cutoffs(SEOUL_CLOCK));
    }

    @Test
    @DisplayName("조기 마감 모집의 끝난 날은 마감한 날이다")
    void earlyClosedRecruitmentEndsOnClosedDate() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.CLOSED, LocalDateTime.of(2026, 9, 1, 10, 0),
                LocalDate.of(2026, 9, 10), LocalDate.of(2026, 8, 20))).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    @DisplayName("늦은 마감(총동연 강제 마감 포함) 모집의 끝난 날은 기간 종료일이다 — 늦게 닫아도 경과일이 처음부터 다시 세지지 않는다")
    void lateClosedRecruitmentEndsOnEndDate() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.CLOSED, LocalDateTime.of(2026, 9, 5, 10, 0),
                LocalDate.of(2026, 8, 25), LocalDate.of(2026, 8, 1))).isEqualTo(LocalDate.of(2026, 8, 25));
    }

    @Test
    @DisplayName("기간 종료일이 없는 마감 모집은 마감 시각의 KST 날짜로 끝난다(23:59 도 그날이다)")
    void closedRecruitmentWithoutEndDateEndsOnClosedDate() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.CLOSED, LocalDateTime.of(2026, 9, 3, 23, 59),
                null, LocalDate.of(2026, 8, 1))).isEqualTo(LocalDate.of(2026, 9, 3));
    }

    @Test
    @DisplayName("마감 시각이 없는 레거시 마감 모집은 기간 종료일로 끝난다")
    void legacyClosedRecruitmentEndsOnEndDate() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.CLOSED, null,
                LocalDate.of(2026, 8, 30), LocalDate.of(2026, 8, 1))).isEqualTo(LocalDate.of(2026, 8, 30));
    }

    @Test
    @DisplayName("마감 시각도 기간 종료일도 없는 마감 모집은 시작일로 끝난다 — 신호 모집의 끝난 날은 비지 않는다")
    void closedRecruitmentWithoutDatesEndsOnStartDate() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.CLOSED, null, null, LocalDate.of(2026, 8, 1)))
                .isEqualTo(LocalDate.of(2026, 8, 1));
    }

    @Test
    @DisplayName("접수 중 모집은 마감 시각이 있어도 보지 않고 기간 종료일로 끝난다")
    void openRecruitmentEndsOnEndDateIgnoringClosedAt() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.OPEN, LocalDateTime.of(2026, 8, 2, 9, 0),
                LocalDate.of(2026, 8, 28), LocalDate.of(2026, 8, 1))).isEqualTo(LocalDate.of(2026, 8, 28));
    }

    @Test
    @DisplayName("기간 종료일이 없는 접수 중 상시모집은 아직 끝나지 않았다(null) — 시작일로 대체하지 않는다")
    void alwaysOpenRecruitmentHasNotEnded() {
        assertThat(ClubSignalPolicy.endedOn(RecruitmentStatus.OPEN, null, null, LocalDate.of(2026, 1, 1))).isNull();
    }
}
