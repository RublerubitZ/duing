package com.duing.global.config;

import com.duing.global.auth.JwtAuthenticationEntryPoint;
import com.duing.global.auth.JwtAuthenticationFilter;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint;

    // 로컬/테스트 기본값은 localhost. 운영(application-prod.yml)은 default 없는 ${CORS_ALLOWED_ORIGINS}
    // 로 이 값을 덮어쓰므로, 운영에서 해당 env 가 비면 기동이 실패한다(잘못된 localhost 폴백 차단).
    @Value("${cors.allowed-origins:http://localhost:3000}")
    private List<String> allowedOrigins;

    // 운영에서 CORS_ALLOWED_ORIGINS 가 빈 문자열("")이거나 와일드카드(*)로 잘못 주입되면, 미설정과 달리
    // placeholder 해석은 통과해 부팅된다. 그런 경우에도 깨진 CORS 설정으로 조용히 뜨지 않도록 기동 시 검증한다.
    @PostConstruct
    void validateCorsOrigins() {
        if (allowedOrigins.isEmpty()
                || allowedOrigins.stream().anyMatch(origin -> origin == null || origin.isBlank())) {
            throw new IllegalStateException(
                    "cors.allowed-origins 가 비어 있습니다 — 운영은 CORS_ALLOWED_ORIGINS 를 설정해야 합니다.");
        }
        if (allowedOrigins.contains("*")) {
            throw new IllegalStateException(
                    "allowCredentials=true 환경에서 CORS Origin 와일드카드(*)는 허용되지 않습니다.");
        }
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .exceptionHandling(ex -> ex.authenticationEntryPoint(jwtAuthenticationEntryPoint))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 로그아웃은 현재 사용자 식별이 필요하므로 auth/** permitAll 보다 앞에서 인증을 요구한다.
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
                        .requestMatchers("/api/v1/auth/**").permitAll()
                        // /clubs/*/members 는 운영진 전용. 아래 clubs/** permitAll 보다
                        // 반드시 앞에 위치해야 first-match 원칙상 인증 가드가 적용된다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/clubs/*/members").authenticated()
                        // 멤버 변경 엔드포인트는 모두 인증 필요. (PATCH role / DELETE member / DELETE me / POST transfer-leader)
                        .requestMatchers("/api/v1/clubs/*/members/**").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/clubs", "/api/v1/clubs/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/recruitments", "/api/v1/recruitments/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/notices", "/api/v1/notices/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/global-events", "/api/v1/global-events/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/promotions").permitAll()
                        .requestMatchers(
                                "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**",
                                "/actuator/health", "/files/**"
                        ).permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Authorization", "Location"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
