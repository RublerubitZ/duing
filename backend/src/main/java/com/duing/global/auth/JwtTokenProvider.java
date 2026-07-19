package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    // HS256 은 RFC 7518 §3.2 상 해시 출력 크기(256비트=32바이트) 이상의 키를 요구한다.
    // 더 짧은 키는 그만큼 보안 강도가 떨어지므로 기동 단계에서 막는다.
    private static final int MIN_SECRET_BYTES = 32;
    private static final long REQUIRED_EXPIRY_MS = 1_800_000L;

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiry-ms}")
    private long expiryMs;

    private Algorithm algorithm;
    private JWTVerifier verifier;

    @PostConstruct
    private void init() {
        if (expiryMs != REQUIRED_EXPIRY_MS) {
            throw new IllegalStateException(
                    "웹 인증 계약을 위해 jwt.expiry-ms는 정확히 1,800,000이어야 합니다.");
        }
        // 설정에 키가 없으면 ${jwt.secret} placeholder 미해석으로 부팅 단계에서 먼저 막히지만,
        // 빈 문자열이 주입되는 경우까지 여기서 명시적으로 잡아 원인을 분명히 한다.
        if (!StringUtils.hasText(secret)) {
            throw new IllegalStateException(
                    "JWT 서명 키(jwt.secret)가 비어 있습니다. "
                            + "JWT_SECRET 환경변수로 최소 32바이트(256비트) 키를 주입하세요.");
        }
        // HMAC256 은 키 문자열의 UTF-8 바이트를 그대로 사용하므로 바이트 길이로 검증한다.
        int secretByteLength = secret.getBytes(StandardCharsets.UTF_8).length;
        if (secretByteLength < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT 서명 키(jwt.secret)는 최소 " + MIN_SECRET_BYTES
                            + "바이트(256비트, HS256 권장)여야 합니다. 실제: " + secretByteLength
                            + "바이트. JWT_SECRET 환경변수를 더 긴 값으로 교체하세요.");
        }
        this.algorithm = Algorithm.HMAC256(secret);
        this.verifier = JWT.require(algorithm).build();
    }

    public String createToken(Long userId, String role) {
        return createToken(userId, role, 0);
    }

    public String createToken(Long userId, String role, int tokenVersion) {
        return createToken(userId, role, tokenVersion, null);
    }

    public String createToken(Long userId, String role, int tokenVersion, Long sessionId) {
        Date now = new Date();
        var jwtBuilder = JWT.create()
                .withSubject(String.valueOf(userId))
                .withClaim("role", role)
                .withClaim("tokenVersion", tokenVersion)
                .withIssuedAt(now)
                .withExpiresAt(new Date(now.getTime() + expiryMs));
        if (sessionId != null) {
            jwtBuilder.withClaim("sid", sessionId);
        }
        return jwtBuilder.sign(algorithm);
    }

    public TokenClaims parse(String token) throws JWTVerificationException {
        DecodedJWT decoded = verifier.verify(token);
        Long userId = Long.parseLong(decoded.getSubject());
        Integer tokenVersion = decoded.getClaim("tokenVersion").asInt();
        // sid 는 이 변경 이전 발급 토큰엔 없으므로 asLong() 이 null 을 돌려준다(구버전 호환).
        Long sessionId = decoded.getClaim("sid").asLong();
        // 이 변경 이전에 발급된 토큰은 tokenVersion 클레임이 없으므로 0(기본값)으로 간주한다.
        return new TokenClaims(userId, tokenVersion == null ? 0 : tokenVersion, sessionId);
    }

    public record TokenClaims(Long userId, int tokenVersion, Long sessionId) {
    }

    /** 웹 access 쿠키 Max-Age 정렬용 — 토큰 수명(초). */
    public long expirySeconds() {
        return expiryMs / 1000;
    }
}
