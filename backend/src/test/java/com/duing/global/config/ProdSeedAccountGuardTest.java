package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;

class ProdSeedAccountGuardTest {

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
}
