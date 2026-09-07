package com.duing.global.privacy;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.draft.repository.ApplicationDraftRepository;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * cutoff 의 타임존 regime 을 고정한다(스펙 §3.1·§8.2). 드리프트는 JVM 기본 존이 KST 가 아닐 때만 드러나므로
 * 각 테스트가 기본 존을 UTC 로 잠시 바꾼다(테스트 JVM 은 순차 실행, 종료 시 복원). Clock 은 항상 seoulClock 과 같은 존.
 */
@ExtendWith(MockitoExtension.class)
class PiiRetentionJobCutoffTest {

    /** UTC 2026-09-07 20:00 = KST 2026-09-08 05:00 — 날짜와 시각이 존에 따라 갈리는 순간. */
    private static final Instant NOW = Instant.parse("2026-09-07T20:00:00Z");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock SEOUL_CLOCK = Clock.fixed(NOW, SEOUL);

    @Mock UserRepository userRepository;
    @Mock ApplicationRepository applicationRepository;
    @Mock PhoneVerificationRepository phoneVerificationRepository;
    @Mock PhoneVerificationEventRepository phoneVerificationEventRepository;
    @Mock ApplicationDraftRepository applicationDraftRepository;

    private TimeZone originalDefaultZone;

    @BeforeEach
    void rememberDefaultZone() {
        originalDefaultZone = TimeZone.getDefault();
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    private PiiRetentionJob job(Period window, Period applicationAnswerWindow) {
        return new PiiRetentionJob(
                new RetentionProperties(true, window, applicationAnswerWindow),
                SEOUL_CLOCK, userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository, applicationDraftRepository);
    }

    @Test
    @DisplayName("탈퇴 45일 cutoff 는 JVM 기본 존이 UTC 여도 KST 벽시계가 아니라 저장 존(UTC) 벽시계로 계산된다")
    void withdrawnCutoffUsesSystemWallClock() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // 저장 존(UTC) 벽시계 2026-09-07T20:00 - 45일. KST 벽시계(09-08T05:00)로 계산했다면 9시간 늦은 값이 된다.
        LocalDateTime expected = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC).minusDays(45);
        verify(userRepository).anonymizeExpiredUsers(expected);
        verify(applicationRepository).scrubExpiredApplicationAnswers(expected);
        verify(phoneVerificationEventRepository).deleteExpiredEvents(expected);
    }

    @Test
    @DisplayName("MO 세션 1일 유예 cutoff 는 seoul regime 컬럼과 비교하므로 JVM 기본 존이 UTC 여도 KST 벽시계로 유지된다")
    void phoneVerificationCutoffStaysSeoulWallClock() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // expires_at 은 발급 시 now(seoulClock) 으로 기록됐다 — KST 벽시계 2026-09-08T05:00 - 1일.
        LocalDateTime expected = LocalDateTime.ofInstant(NOW, SEOUL).minusDays(1);
        verify(phoneVerificationRepository).deleteExpiredVerifications(expected);
    }

    @Test
    @DisplayName("마감 6개월 cutoff 날짜는 JVM 기본 존이 UTC 여도 KST 오늘 기준으로 계산된다")
    void closedCutoffDateUsesSeoulToday() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));

        job(Period.ofDays(45), Period.ofMonths(6)).run();

        // NOW 는 UTC 9/7 20:00 = KST 9/8 05:00 → KST 오늘(9/8) - 6개월 = 3/8. UTC 날짜(9/7)로 계산했다면 3/7.
        verify(applicationRepository).purgeExpiredTextAnswers(
                eq(LocalDate.of(2026, 3, 8)), any(LocalDateTime.class), eq(PiiRetentionJob.ANSWER_PURGED_PLACEHOLDER));
        verify(applicationDraftRepository).deleteExpired(eq(LocalDate.of(2026, 3, 8)), any(LocalDateTime.class));
    }

    @Test
    @DisplayName("두 보관기간 중 하나라도 0/음수면 어떤 리포지토리도 호출하지 않는다 (오설정 안전장치)")
    void skipsEverythingWhenAnyWindowNonPositive() {
        job(Period.ofDays(45), Period.ZERO).run();
        job(Period.ZERO, Period.ofMonths(6)).run();

        verifyNoInteractions(userRepository, applicationRepository,
                phoneVerificationRepository, phoneVerificationEventRepository, applicationDraftRepository);
    }
}
