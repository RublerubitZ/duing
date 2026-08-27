package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.mo.MoVerificationClient;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 재설정 시작의 <b>리미터 호출 순서 불변식</b>만 잠그는 목 기반 테스트.
 *
 * <p>IP 창 선검사가 학번 창 기록보다 앞에 있어야 한다. 뒤로 가거나 사라지면, IP 한도로 거절될 요청도
 * 학번 창에 엔트리를 설치하고 나가 8자리 학번 공간(1e8)만큼 맵이 자라 비인증 요청만으로 힙이 샌다.
 *
 * <p>이 불변식은 통합 테스트로 잠기지 않는다 — 선검사를 지워도 issue() 내부의 기록 호출이 같은 임계에서
 * 같은 예외를 내주므로 응답(429)이 완전히 동일하기 때문이다. 관측 가능한 차이는 "거절된 요청이 학번 창을
 * 소모했는가" 뿐이라 호출 순서를 직접 단언한다.
 */
class PasswordResetLimiterOrderTest {

    private static final String CLIENT_IP = "10.0.0.1";
    private static final String STUDENT_ID = "20251234";

    private final PhoneVerificationRateLimiter rateLimiter = mock(PhoneVerificationRateLimiter.class);

    private final GeneralPhoneVerificationService phoneVerificationService = new GeneralPhoneVerificationService(
            mock(PhoneVerificationRepository.class),
            mock(PhoneVerificationSessionManager.class),
            mock(UserRepository.class),
            mock(PhoneVerificationCodeDeriver.class),
            rateLimiter,
            mock(MoPollThrottle.class),
            mock(MoVerificationClient.class),
            Clock.system(ZoneId.of("Asia/Seoul")),
            "01000000000");

    @Test
    @DisplayName("IP 발급 한도로 거절된 재설정 시작은 학번 창을 소모하지 않는다 — 선검사가 학번 기록보다 앞이라는 불변식")
    void ipLimitRejectionDoesNotConsumeStudentIdWindow() {
        doThrow(new PhoneVerificationException.VerificationRateLimitedException())
                .when(rateLimiter).assertIssueIpWithinLimit(anyString(), any(LocalDateTime.class));

        assertThatThrownBy(() -> phoneVerificationService.startPasswordReset(STUDENT_ID, false, CLIENT_IP))
                .isInstanceOf(PhoneVerificationException.VerificationRateLimitedException.class);

        verify(rateLimiter, never()).assertAndRecordPasswordResetStart(anyString(), any(LocalDateTime.class));
    }
}
