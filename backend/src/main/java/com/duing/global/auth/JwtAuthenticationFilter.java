package com.duing.global.auth;

import com.auth0.jwt.exceptions.JWTVerificationException;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        TokenCandidate candidate = extractToken(request);
        request.setAttribute(AuthTransport.REQUEST_ATTRIBUTE, candidate.transport());
        if (candidate.token() != null) {
            try {
                JwtTokenProvider.TokenClaims claims = jwtTokenProvider.parse(candidate.token());
                // 사용자(DB)를 조회해 (a) soft-deleted 탈퇴 계정은 @SQLRestriction 으로 미발견 → 거부하고,
                // (b) token_version 이 불일치(로그아웃·강제 폐기로 증가)면 거부한다. 권한은 토큰의 role
                // 클레임이 아니라 DB 의 현재 role 로 구성해 역할 변경(예: 관리자 강등)도 즉시 반영한다.
                userRepository.findById(claims.userId())
                        .filter(user -> user.getTokenVersion() == claims.tokenVersion())
                        .ifPresentOrElse(
                                user -> authenticate(user, claims.sessionId()),
                                SecurityContextHolder::clearContext);
            } catch (JWTVerificationException exception) {
                log.debug("JWT 검증 실패: {}", exception.getMessage());
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(User user, Long sessionId) {
        UserPrincipal principal = UserPrincipal.of(user.getId(), user.getRole().name(), sessionId);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private TokenCandidate extractToken(HttpServletRequest request) {
        String header = request.getHeader(HEADER);
        if (StringUtils.hasText(header) && header.startsWith(PREFIX)
                && StringUtils.hasText(header.substring(PREFIX.length()))) {
            return new TokenCandidate(header.substring(PREFIX.length()), AuthTransport.BEARER);
        }
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if (WebAuthCookieService.ACCESS_COOKIE_NAME.equals(cookie.getName())
                        && StringUtils.hasText(cookie.getValue())) {
                    return new TokenCandidate(cookie.getValue(), AuthTransport.COOKIE);
                }
            }
        }
        return new TokenCandidate(null, AuthTransport.NONE);
    }

    private record TokenCandidate(String token, AuthTransport transport) {
    }
}
