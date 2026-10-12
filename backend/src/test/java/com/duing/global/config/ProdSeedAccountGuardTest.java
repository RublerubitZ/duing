package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;

class ProdSeedAccountGuardTest {

    // 테스트·CI 에 평문으로 공개된 더미 시크릿 — 가드의 해시 목록이 이 평문과 정확히 대응하는지 다시 계산해 본다.
    private static final List<String> PUBLIC_DUMMY_SECRETS = List.of(
            "duing-test-jwt-secret-key-that-is-long-enough-for-hs256-algorithm",
            "duing-test-auth-hint-secret-key-that-is-different-from-jwt",
            "duing-test-phone-verification-secret",
            "ZHVpbmctdGVzdC1mZWUtYWNjb3VudC1hZXMyNTYta2U=",
            "jwt-secret-that-is-at-least-thirty-two-bytes",
            "hint-secret-that-is-at-least-thirty-two-bytes",
            "unit-test-phone-verification-secret",
            "0123456789abcdef0123456789abcdef",
            "test-only-revalidate-secret-0123456789",
            "ci-only-auth-hint-secret-at-least-32-bytes",
            "test-auth-hint-secret-at-least-32-bytes");

    private final JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);

    private static MockEnvironment prodEnv(String flywayLocations) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        environment.setProperty("spring.flyway.locations", flywayLocations);
        return environment;
    }

    @Test
    @DisplayName("운영 프로파일에서 시드 계정이 DB 에 있으면 부팅이 실패한다")
    void failsWhenSeedAccountPresentInProd() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(1);
        ProdSeedAccountGuard guard =
                new ProdSeedAccountGuard(prodEnv("classpath:db/migration"), jdbcTemplate);

        assertThatThrownBy(guard::verifyOnStartup)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("시드 계정");
    }

    @Test
    @DisplayName("운영 프로파일에서 flyway.locations 에 dev 시드가 포함되면 부팅이 실패한다")
    void failsWhenDevSeedLocationActiveInProd() {
        ProdSeedAccountGuard guard = new ProdSeedAccountGuard(
                prodEnv("classpath:db/migration,classpath:db/migration-dev"), jdbcTemplate);

        assertThatThrownBy(guard::verifyOnStartup)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("migration-dev");
    }

    @Test
    @DisplayName("운영 프로파일이고 시드 계정이 없으며 location 이 정상이면 통과한다")
    void passesWhenProdCleanAndLocationsSafe() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        ProdSeedAccountGuard guard =
                new ProdSeedAccountGuard(prodEnv("classpath:db/migration"), jdbcTemplate);

        assertThatCode(guard::verifyOnStartup).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("local 프로파일에서는 시드 계정이 있어도 가드가 동작하지 않는다")
    void noopOnNonProdProfile() {
        MockEnvironment localEnv = new MockEnvironment();
        localEnv.setActiveProfiles("local");
        localEnv.setProperty("spring.flyway.locations", "classpath:db/migration,classpath:db/migration-dev");
        ProdSeedAccountGuard guard = new ProdSeedAccountGuard(localEnv, jdbcTemplate);

        // 운영이 아니므로 DB 조회·location 검사 없이 즉시 통과한다(DB 미접근을 명시 검증).
        assertThatCode(guard::verifyOnStartup).doesNotThrowAnyException();
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    @DisplayName("더미 시크릿 해시 목록은 공개된 더미 평문 11개와 정확히 대응한다")
    void dummyHashListMatchesPublicDummies() throws Exception {
        Set<String> recomputed = new HashSet<>();
        for (String dummySecret : PUBLIC_DUMMY_SECRETS) {
            recomputed.add(sha256Hex(dummySecret));
        }
        assertThat(ProdSeedAccountGuard.PUBLIC_DUMMY_SECRET_SHA256).isEqualTo(recomputed);
    }

    @Test
    @DisplayName("운영 프로파일에서 JWT 서명 키가 공개 더미 값이면 부팅이 실패하고 메시지에 값은 실리지 않는다")
    void failsWhenJwtSecretIsPublicDummy() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        MockEnvironment environment = prodEnv("classpath:db/migration");
        environment.setProperty("jwt.secret", "jwt-secret-that-is-at-least-thirty-two-bytes");

        assertThatThrownBy(new ProdSeedAccountGuard(environment, jdbcTemplate)::verifyOnStartup)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("jwt.secret")
                .hasMessageNotContaining("jwt-secret-that-is-at-least-thirty-two-bytes");
    }

    @Test
    @DisplayName("끝에 공백·개행이 붙은 더미 시크릿도 걸린다")
    void failsWhenDummySecretHasTrailingWhitespace() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        MockEnvironment environment = prodEnv("classpath:db/migration");
        environment.setProperty("phone-verification.secret", "duing-test-phone-verification-secret \n");

        assertThatThrownBy(new ProdSeedAccountGuard(environment, jdbcTemplate)::verifyOnStartup)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("phone-verification.secret");
    }

    @Test
    @DisplayName("운영 프로파일에서 시크릿이 공개 더미가 아니면 통과한다")
    void passesWhenSecretsAreNotPublicDummies() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        MockEnvironment environment = prodEnv("classpath:db/migration");
        for (String propertyKey : ProdSeedAccountGuard.SECRET_PROPERTY_KEYS) {
            environment.setProperty(propertyKey, UUID.randomUUID() + "-" + UUID.randomUUID());
        }

        assertThatCode(new ProdSeedAccountGuard(environment, jdbcTemplate)::verifyOnStartup)
                .doesNotThrowAnyException();
    }

    // 테스트 yml 의 더미를 누가 바꾸면 해시 목록도 같이 바꾸게 하는 가드. 테스트 클래스패스에는 application.yml 이
    // 둘이라 소스 트리 파일을 직접 읽는다(ProdProfileConfigPolicyTest 관례). revalidate-secret 은 테스트 yml 에 없다.
    @ParameterizedTest
    @ValueSource(strings = {
            "jwt.secret", "web-auth.hint-secret", "phone-verification.secret", "security.fee-account.encryption-key"})
    @DisplayName("테스트 설정 yml 의 더미 시크릿은 모두 운영 가드에 걸린다")
    void testYmlDummySecretsAreBlocked(String propertyKey) throws Exception {
        Path testYml = Path.of("src/test/resources/application.yml");
        List<PropertySource<?>> documents =
                new YamlPropertySourceLoader().load(testYml.toString(), new FileSystemResource(testYml));
        Object dummyValue = documents.stream()
                .map(document -> document.getProperty(propertyKey))
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        assertThat(dummyValue).as("테스트 yml 에 %s 가 있어야 한다", propertyKey).isNotNull();

        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any(Object[].class))).thenReturn(0);
        MockEnvironment environment = prodEnv("classpath:db/migration");
        environment.setProperty(propertyKey, dummyValue.toString());

        assertThatThrownBy(new ProdSeedAccountGuard(environment, jdbcTemplate)::verifyOnStartup)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining(propertyKey);
    }

    private static String sha256Hex(String value) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
