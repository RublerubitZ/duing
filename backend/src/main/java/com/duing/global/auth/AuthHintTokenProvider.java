package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class AuthHintTokenProvider {
    private static final int MIN_SECRET_BYTES = 32;
    private static final String HINT_TYPE = "AUTH_HINT";

    private final Algorithm algorithm;
    private final long expiryMs;

    public AuthHintTokenProvider(
            @Value("${web-auth.hint-secret}") String hintSecret,
            @Value("${jwt.secret}") String jwtSecret,
            @Value("${jwt.expiry-ms}") long expiryMs) {
        validateSecret(hintSecret);
        if (hintSecret.equals(jwtSecret)) {
            throw new IllegalStateException("JWT_SECRET과 AUTH_HINT_SECRET은 서로 다른 값이어야 합니다.");
        }
        this.algorithm = Algorithm.HMAC256(hintSecret);
        this.expiryMs = expiryMs;
    }

    public String create(String role) {
        Instant expiresAt = Instant.now().plusMillis(expiryMs);
        return JWT.create()
                .withClaim("typ", HINT_TYPE)
                .withClaim("role", role)
                .withExpiresAt(Date.from(expiresAt))
                .sign(algorithm);
    }

    long maxAgeSeconds() {
        return expiryMs / 1000L;
    }

    private void validateSecret(String hintSecret) {
        if (!StringUtils.hasText(hintSecret)
                || hintSecret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("AUTH_HINT_SECRET은 최소 32바이트여야 합니다.");
        }
    }
}
