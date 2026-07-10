package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.PhoneVerification;
import com.duing.domain.user.entity.PhoneVerificationEvent;
import com.duing.domain.user.entity.PhoneVerificationEventType;
import com.duing.domain.user.entity.VerificationPurpose;
import com.duing.domain.user.exception.PhoneVerificationException;
import com.duing.domain.user.repository.PhoneVerificationEventRepository;
import com.duing.domain.user.repository.PhoneVerificationRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class PhoneVerificationSessionConsumeTest {

    @Autowired PhoneVerificationSessionManager sessionManager;
    @Autowired PhoneVerificationRepository phoneVerificationRepository;
    @Autowired PhoneVerificationEventRepository phoneVerificationEventRepository;
    @Autowired Clock clock;

    private PhoneVerification saveSession(String phone) {
        return phoneVerificationRepository.save(PhoneVerification.issue(
                phone, UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock)));
    }

    private PhoneVerification saveVerifiedSession(String phone) {
        PhoneVerification session = saveSession(phone);
        session.markVerified(LocalDateTime.now(clock));
        return session;
    }

    @Test
    @DisplayName("인증 완료된 SIGNUP 세션은 행잠금 조회로 반환된다")
    void returnsVerifiedSignupSession() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0001");

        PhoneVerification loaded = sessionManager.getVerifiedSessionForUpdate(
                verified.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock));

        assertThat(loaded.getPhone()).isEqualTo("010-2000-0001");
    }

    @Test
    @DisplayName("존재하지 않는 토큰으로 소비를 시도하면 PHONE_NOT_VERIFIED 예외가 발생한다")
    void rejectsUnknownToken() {
        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                "no-such-token", VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("아직 인증되지 않은(PENDING) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsPendingSession() {
        PhoneVerification pending = saveSession("010-2000-0002");

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                pending.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("인증 후 완료 창(SIGNUP 30분)이 지난 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsSessionPastCompletionWindow() {
        PhoneVerification stale = saveSession("010-2000-0003");
        stale.markVerified(LocalDateTime.now(clock).minusMinutes(31));

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                stale.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("만료된(미인증) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsExpiredUnverifiedSession() {
        // 발급 유효 5분 — 6분 전 발급 세션은 이미 EXPIRED (spec §15 "만료 후 signup 403")
        PhoneVerification expired = phoneVerificationRepository.save(PhoneVerification.issue(
                "010-2000-0007", UUID.randomUUID().toString(), VerificationPurpose.SIGNUP, null,
                LocalDateTime.now(clock).minusMinutes(6)));

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                expired.getToken(), VerificationPurpose.SIGNUP, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("용도가 다른(비 SIGNUP 기대) 세션으로 소비를 시도하면 예외가 발생한다")
    void rejectsPurposeMismatch() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0004");

        assertThatThrownBy(() -> sessionManager.getVerifiedSessionForUpdate(
                verified.getToken(), VerificationPurpose.PHONE_CHANGE, LocalDateTime.now(clock)))
                .isInstanceOf(PhoneVerificationException.PhoneNotVerifiedException.class);
    }

    @Test
    @DisplayName("소비하면 세션 행이 삭제되고 userId 가 포함된 CONSUMED 감사 이벤트가 남는다")
    void consumeDeletesRowAndRecordsAuditEvent() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0005");
        String token = verified.getToken();

        sessionManager.consume(verified, 77L, "127.0.0.1", "junit-agent");

        assertThat(phoneVerificationRepository.findByToken(token)).isEmpty();
        List<PhoneVerificationEvent> events = phoneVerificationEventRepository.findAll();
        assertThat(events).hasSize(1);
        PhoneVerificationEvent consumedEvent = events.get(0);
        assertThat(consumedEvent.getEventType()).isEqualTo(PhoneVerificationEventType.CONSUMED);
        assertThat(consumedEvent.getUserId()).isEqualTo(77L);
        assertThat(consumedEvent.getPhone()).isEqualTo("010-2000-0005");
        assertThat(consumedEvent.getPurpose()).isEqualTo(VerificationPurpose.SIGNUP);
        assertThat(consumedEvent.getClientIp()).isEqualTo("127.0.0.1");
    }

    @Test
    @DisplayName("300자를 넘는 User-Agent 는 CONSUMED 이벤트에서도 300자로 잘려 저장된다")
    void consumeTruncatesOversizedUserAgent() {
        PhoneVerification verified = saveVerifiedSession("010-2000-0006");

        sessionManager.consume(verified, 78L, "127.0.0.1", "x".repeat(400));

        PhoneVerificationEvent consumedEvent = phoneVerificationEventRepository.findAll().get(0);
        assertThat(consumedEvent.getUserAgent()).hasSize(300);
    }
}
