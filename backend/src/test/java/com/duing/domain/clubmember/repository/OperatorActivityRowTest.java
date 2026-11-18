package com.duing.domain.clubmember.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 운영진 마지막 접속 = 세션(seoul)·로그인(system)을 각각 절대시각으로 바꾼 뒤 늦은 값(TIMEZONE.md). 운영 JVM 처럼 UTC 로 돈다. */
class OperatorActivityRowTest {

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
    @DisplayName("벽시계로는 세션이 늦어 보여도 절대시각으로 바꿔 비교한다 — KST 10:00 세션은 UTC 05:00 로그인보다 이르다")
    void comparesAfterConvertingEachRegime() {
        OperatorActivityRow activity = row(LocalDateTime.of(2026, 9, 7, 10, 0), LocalDateTime.of(2026, 9, 7, 5, 0));

        assertThat(activity.lastActiveAt()).isEqualTo(Instant.parse("2026-09-07T05:00:00Z"));
    }

    @Test
    @DisplayName("한쪽 기록만 있으면 그 값, 둘 다 없으면 null 이다")
    void fallsBackToTheOnlyRecordOrNull() {
        assertThat(row(LocalDateTime.of(2026, 9, 7, 10, 0), null).lastActiveAt()).isEqualTo(Instant.parse("2026-09-07T01:00:00Z"));
        assertThat(row(null, LocalDateTime.of(2026, 9, 7, 5, 0)).lastActiveAt()).isEqualTo(Instant.parse("2026-09-07T05:00:00Z"));
        assertThat(row(null, null).lastActiveAt()).isNull();
    }

    private static OperatorActivityRow row(LocalDateTime sessionUsedAt, LocalDateTime loggedInAt) {
        return new OperatorActivityRow() {
            @Override
            public Long getClubId() {
                return 1L;
            }

            @Override
            public LocalDateTime getLastSessionUsedAt() {
                return sessionUsedAt;
            }

            @Override
            public LocalDateTime getLastLoginAt() {
                return loggedInAt;
            }
        };
    }
}
