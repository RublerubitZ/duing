package com.duing.domain.user.service;

import com.duing.domain.user.entity.AuthEvent;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.auth.RefreshTokenGenerator;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@Transactional(readOnly = true)
public class GeneralAuthSessionService implements AuthSessionService {

    private final AuthSessionRepository authSessionRepository;
    private final AuthRefreshTokenRepository authRefreshTokenRepository;
    private final AuthEventRepository authEventRepository;
    private final UserRepository userRepository;
    private final RefreshTokenGenerator refreshTokenGenerator;
    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;
    private final Duration refreshTtl;
    private final Duration reuseGrace;
    private final int maxConcurrentSessions;

    public GeneralAuthSessionService(
            AuthSessionRepository authSessionRepository,
            AuthRefreshTokenRepository authRefreshTokenRepository,
            AuthEventRepository authEventRepository,
            UserRepository userRepository,
            RefreshTokenGenerator refreshTokenGenerator,
            JwtTokenProvider jwtTokenProvider,
            Clock clock,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays,
            @Value("${duing.auth.refresh.reuse-grace-seconds:30}") long reuseGraceSeconds,
            @Value("${duing.auth.session.max-concurrent:5}") int maxConcurrentSessions) {
        this.authSessionRepository = authSessionRepository;
        this.authRefreshTokenRepository = authRefreshTokenRepository;
        this.authEventRepository = authEventRepository;
        this.userRepository = userRepository;
        this.refreshTokenGenerator = refreshTokenGenerator;
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
        this.refreshTtl = Duration.ofDays(refreshTtlDays);
        this.reuseGrace = Duration.ofSeconds(reuseGraceSeconds);
        this.maxConcurrentSessions = maxConcurrentSessions;
    }

    @Override
    @Transactional
    public IssuedSession issue(IssueSessionCommand issueSessionCommand) {
        LocalDateTime now = LocalDateTime.now(clock);
        evictOverLimit(issueSessionCommand, now);

        AuthSession session = authSessionRepository.save(AuthSession.create(
                issueSessionCommand.userId(), issueSessionCommand.platform(),
                issueSessionCommand.deviceLabel(), issueSessionCommand.userAgent(),
                issueSessionCommand.ipAddress(), issueSessionCommand.rememberMe(), now, refreshTtl));
        String rawRefreshToken = refreshTokenGenerator.generate();
        authRefreshTokenRepository.save(
                AuthRefreshToken.issue(session.getId(), refreshTokenGenerator.hash(rawRefreshToken)));
        authEventRepository.save(AuthEvent.of(issueSessionCommand.userId(), session.getId(),
                AuthEventType.LOGIN, issueSessionCommand.platform().name(),
                issueSessionCommand.ipAddress(), issueSessionCommand.userAgent()));
        return new IssuedSession(session.getId(), rawRefreshToken);
    }

    /** 상한 초과분 LRU 폐기 — 엔티티 revoke 를 먼저 모아서 하고, 토큰 벌크 폐기는 한 번에 실행한다. */
    private void evictOverLimit(IssueSessionCommand issueSessionCommand, LocalDateTime now) {
        List<AuthSession> activeSessions = authSessionRepository
                .findByUserIdAndRevokedAtIsNullOrderByLastUsedAtAsc(issueSessionCommand.userId());
        int overflowCount = activeSessions.size() - (maxConcurrentSessions - 1);
        if (overflowCount <= 0) {
            return;
        }
        List<Long> evictedSessionIds = new ArrayList<>();
        for (int i = 0; i < overflowCount; i++) {
            AuthSession lruSession = activeSessions.get(i);
            lruSession.revoke(now, SessionRevokeReason.SESSION_LIMIT);
            evictedSessionIds.add(lruSession.getId());
            authEventRepository.save(AuthEvent.of(issueSessionCommand.userId(), lruSession.getId(),
                    AuthEventType.SESSION_EVICTED, "limit=" + maxConcurrentSessions,
                    issueSessionCommand.ipAddress(), issueSessionCommand.userAgent()));
        }
        authRefreshTokenRepository.revokeBySessionIds(evictedSessionIds, RefreshTokenStatus.REVOKED);
    }
}
