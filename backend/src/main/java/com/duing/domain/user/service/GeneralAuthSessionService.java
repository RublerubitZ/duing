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
import com.duing.domain.user.service.dto.query.SessionSummary;
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

    // 재사용 탐지(detectReuse)의 세션 폐기·전 토큰 REVOKED·감사 기록은 401 응답과 함께 반드시
    // 커밋되어야 한다 — 기본 롤백이면 탈취 대응(패밀리 폐기·감사)이 증발해 세션이 살아남는다.
    // 나머지 SessionExpiredException 경로는 throw 전 쓰기가 없어 커밋되어도 부작용이 없다.
    @Override
    @Transactional(noRollbackFor = AuthSessionException.SessionExpiredException.class)
    public RotationResult rotate(String rawRefreshToken) {
        LocalDateTime now = LocalDateTime.now(clock);
        String tokenHash = refreshTokenGenerator.hash(rawRefreshToken);
        // 세션 행만 FOR UPDATE 로 잠그므로, 잠금 전 스칼라로 세션 id 만 먼저 얻는다.
        // 토큰은 잠금 획득 후 재조회로 최신 상태를 보장한다 — 엔티티를 영속성 컨텍스트에 올리지 않아,
        // 잠금 대기 중 변경된 토큰 상태를 재조회가 그대로 읽는다.
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
            case ROTATED -> {
                if (presentedToken.isReusableWithinGrace(now, reuseGrace)) {
                    // 동시 탭 latest-wins (spec §5.3): 직전 후계(현재 ACTIVE)를 REVOKED 로 밀어내고
                    // 새 체인을 잇는다. 구토큰은 ROTATED 그대로 — grace 기준점(rotated_at)을 보존한다.
                    authRefreshTokenRepository
                            .findBySessionIdAndStatus(session.getId(), RefreshTokenStatus.ACTIVE)
                            .ifPresent(AuthRefreshToken::markRevoked);
                } else {
                    detectReuse(session, presentedToken, now);
                }
            }
            case REVOKED -> detectReuse(session, presentedToken, now);
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

    @Override
    @Transactional
    public boolean revokeCurrent(Long userIdOrNull, String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        Long targetSessionId = resolveSessionId(rawRefreshTokenOrNull, sessionIdOrNull);
        if (targetSessionId == null) {
            return false;
        }
        AuthSession session = authSessionRepository.findByIdForUpdate(targetSessionId).orElse(null);
        if (session == null) {
            return false;
        }
        // refresh 소지 없이 sid 만으로 타인 세션을 지목하는 경로 차단 — 사용자 불일치는 미식별로 처리.
        // (이 분기에서 잡은 세션 잠금은 타인 것이라 이후 user 잠금과 교차하지 않는다 — 순환 없음)
        if (userIdOrNull != null && !session.getUserId().equals(userIdOrNull)) {
            return false;
        }
        if (session.getRevokedAt() != null) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        session.revoke(now, SessionRevokeReason.LOGOUT);
        authRefreshTokenRepository.revokeBySessionIds(List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(session.getUserId(), session.getId(),
                AuthEventType.LOGOUT, null, null, null));
        return true;
    }

    private Long resolveSessionId(String rawRefreshTokenOrNull, Long sessionIdOrNull) {
        if (rawRefreshTokenOrNull != null) {
            Long sessionIdFromToken = authRefreshTokenRepository
                    .findSessionIdByTokenHash(refreshTokenGenerator.hash(rawRefreshTokenOrNull))
                    .orElse(null);
            if (sessionIdFromToken != null) {
                return sessionIdFromToken;
            }
        }
        return sessionIdOrNull;
    }

    @Override
    @Transactional
    public void revokeAll(Long userId, SessionRevokeReason reason) {
        LocalDateTime now = LocalDateTime.now(clock);
        int revokedCount = authSessionRepository.revokeAllActive(userId, now, reason);
        authRefreshTokenRepository.revokeAllByUserId(userId, RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(userId, null, eventTypeFor(reason),
                "revokedSessions=" + revokedCount, null, null));
    }

    @Override
    public List<SessionSummary> listSessions(Long userId, Long currentSessionIdOrNull) {
        return authSessionRepository.findByUserIdAndRevokedAtIsNullOrderByLastUsedAtDesc(userId).stream()
                .map(session -> new SessionSummary(
                        session.getId(), session.getPlatform(), session.getDeviceLabel(),
                        session.getLastUsedAt(), session.getCreatedAt(),
                        session.getId().equals(currentSessionIdOrNull)))
                .toList();
    }

    @Override
    @Transactional
    public boolean revokeOne(Long userId, Long sessionId) {
        AuthSession session = authSessionRepository.findByIdForUpdate(sessionId).orElse(null);
        // 타인 세션 지목 차단 — revokeCurrent 와 동일한 소유 검증 (spec §8: 본인 것만)
        if (session == null || !session.getUserId().equals(userId) || session.getRevokedAt() != null) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(clock);
        session.revoke(now, SessionRevokeReason.LOGOUT);
        authRefreshTokenRepository.revokeBySessionIds(List.of(session.getId()), RefreshTokenStatus.REVOKED);
        authEventRepository.save(AuthEvent.of(userId, session.getId(), AuthEventType.LOGOUT, null, null, null));
        return true;
    }

    private AuthEventType eventTypeFor(SessionRevokeReason reason) {
        return switch (reason) {
            case LOGOUT_ALL -> AuthEventType.LOGOUT_ALL;
            case ADMIN_FORCE -> AuthEventType.ADMIN_FORCE_LOGOUT;
            default -> AuthEventType.SESSIONS_REVOKED;
        };
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
