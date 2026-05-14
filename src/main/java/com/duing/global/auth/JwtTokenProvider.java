package com.duing.global.auth;

import com.auth0.jwt.JWT;
import com.auth0.jwt.JWTVerifier;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.exceptions.JWTVerificationException;
import com.auth0.jwt.interfaces.DecodedJWT;
import jakarta.annotation.PostConstruct;
import java.util.Date;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiry-ms}")
    private long expiryMs;

    private Algorithm algorithm;
    private JWTVerifier verifier;

    @PostConstruct
    void init() {
        this.algorithm = Algorithm.HMAC256(secret);
        this.verifier = JWT.require(algorithm).build();
    }

    public String createToken(Long userId, String role) {
        Date now = new Date();
        return JWT.create()
                .withSubject(String.valueOf(userId))
                .withClaim("role", role)
                .withIssuedAt(now)
                .withExpiresAt(new Date(now.getTime() + expiryMs))
                .sign(algorithm);
    }

    public UserPrincipal parse(String token) throws JWTVerificationException {
        DecodedJWT decoded = verifier.verify(token);
        Long userId = Long.parseLong(decoded.getSubject());
        String role = decoded.getClaim("role").asString();
        return UserPrincipal.of(userId, role);
    }
}
