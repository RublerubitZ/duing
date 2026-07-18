package com.duing.domain.user.service;

import com.duing.domain.user.entity.AuthEvent;
import com.duing.domain.user.entity.AuthEventType;
import com.duing.domain.user.entity.AuthRefreshToken;
import com.duing.domain.user.entity.AuthSession;
import com.duing.domain.user.entity.RefreshTokenStatus;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.AuthSessionException;
import com.duing.domain.user.repository.AuthEventRepository;
import com.duing.domain.user.repository.AuthRefreshTokenRepository;
import com.duing.domain.user.repository.AuthSessionRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.IssueSessionCommand;
import com.duing.domain.user.service.dto.query.IssuedSession;
import com.duing.domain.user.service.dto.query.RotationResult;
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

    @Override
    @Transactional
    public RotationResult rotate(String rawRefreshToken) {
        LocalDateTime now = LocalDateTime.now(clock);
        String tokenHash = refreshTokenGenerator.hash(rawRefreshToken);
        // 잠금 순서 불변식(user → session → token)에 맞추기 위해 스칼라로 세션 id 만 먼저 얻는다.
        // 엔티티를 영속성 컨텍스트에 올리지 않아, 잠금 획득 후 재조회가 최신 상태를 읽는다.
        Long sessionId = authRefreshTokenRepository.findSessionIdByTokenHash(tokenHash)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        AuthSession session = authSessionRepository.findByIdForUpdate(sessionId)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        AuthRefreshToken presentedToken = authRefreshTokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(AuthSessionException.SessionExpiredException::new);
        if (!session.isUsable(now)) {
            throw new AuthSessionException.SessionExpiredException();
        }
        // 연관 아닌 명시 조회 — 탈퇴(soft-delete) 사용자는 @SQLRestriction 으로 미발견 → 401
        User user = userRepository.findById(session.getUserId())
                .orElseThrow(AuthSessionException.SessionExpiredException::new);

        switch (presentedToken.getStatus()) {
            case ACTIVE -> presentedToken.markRotated(now);
            case ROTATED, REVOKED -> detectReuse(session, presentedToken, now);
        }

        // Hibernate flush 는 INSERT 를 UPDATE 보다 먼저 실행한다 — 상태 전이를 먼저 flush 하지 않으면
        // 새 ACTIVE INSERT 가 구 ACTIVE 와 부분 유니크(uq_auth_refresh_token_active)에서 충돌한다.
        authRefreshTokenRepository.flush();
        String newRawRefreshToken = refreshTokenGenerator.generate();
        authRefreshTokenRepository.save(
                AuthRefreshToken.issue(sessionId, refreshTokenGenerator.hash(newRawRefreshToken)));
        session.touch(now, refreshTtl);
        String accessToken = jwtTokenProvider.createToken(
                user.getId(), user.getRole().name(), user.getTokenVersion(), sessionId);
        return new RotationResult(accessToken, newRawRefreshToken,
                user.getRole().name(), session.isRememberMe());
    }

    /** 폐기 토큰 재사용 = Replay/탈취 — 해당 세션(패밀리)만 폐기하고 감사·모니터링에 남긴다 (spec §5.4). */
    private void detectReuse(AuthSession session, AuthRefreshToken presentedToken, LocalDateTime now) {
        session.revoke(now, SessionRevokeReason.REUSE_DETECTED);
        authRefreshTokenRepository.revokeBySessionIds(
                List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(session.getUserId(), session.getId(),
                AuthEventType.REUSE_DETECTED, "tokenId=" + presentedToken.getId(), null, null));
        // ERROR 레벨은 logback-Sentry 연동으로 이벤트 전송된다 — 보안 모니터링 (spec §18.2)
        log.error("리프레시 토큰 재사용 탐지 — 세션 폐기. userId={}, sessionId={}",
                session.getUserId(), session.getId());
        throw new AuthSessionException.SessionExpiredException();
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
