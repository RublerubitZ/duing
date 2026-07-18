package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 미들웨어 라우팅 힌트 토큰 (spec §10). 인증 자격이 아니다 — API 인가는 access 토큰이 전담한다.
 * 수명은 refresh 세션 지평선(30일)에 정렬하고 rotation 마다 재발급된다.
 * 클레임은 정확히 {typ, role, exp} — FE 미들웨어가 키 집합을 검증하므로 추가 금지.
 */
@Component
public class AuthHintTokenProvider {
    private static final int MIN_SECRET_BYTES = 32;
    private static final String HINT_TYPE = "AUTH_HINT";

    private final Algorithm algorithm;
    private final Duration hintLifetime;

    public AuthHintTokenProvider(
            @Value("${web-auth.hint-secret}") String hintSecret,
            @Value("${jwt.secret}") String jwtSecret,
            @Value("${duing.auth.refresh.ttl-days:30}") int refreshTtlDays) {
        validateSecret(hintSecret);
        if (hintSecret.equals(jwtSecret)) {
            throw new IllegalStateException("JWT_SECRET과 AUTH_HINT_SECRET은 서로 다른 값이어야 합니다.");
        }
        this.algorithm = Algorithm.HMAC256(hintSecret);
        this.hintLifetime = Duration.ofDays(refreshTtlDays);
    }

    public String create(String role) {
        Instant expiresAt = Instant.now().plus(hintLifetime);
        return JWT.create()
                .withClaim("typ", HINT_TYPE)
                .withClaim("role", role)
                .withExpiresAt(Date.from(expiresAt))
                .sign(algorithm);
    }

    private void validateSecret(String hintSecret) {
        if (!StringUtils.hasText(hintSecret)
                || hintSecret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("AUTH_HINT_SECRET은 최소 32바이트여야 합니다.");
        }
    }
}
