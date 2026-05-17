package com.duing.common;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * 통합 테스트용 PostgreSQL Testcontainer.
 *
 * <p>@SpringBootTest 클래스에 @Import(TestcontainersConfiguration.class) 를 붙이면
 * Spring Boot 가 자동으로 spring.datasource.* 를 컨테이너 값으로 덮어쓴다.
 *
 * <p>컨테이너는 JVM 라이프타임 동안 한 번만 기동되어 모든 테스트가 공유한다. Flyway 가
 * 매 컨텍스트 기동마다 migration + migration-dev 를 재적용하므로 스키마는 항상 깨끗하다.
 * 테스트 간 데이터 격리는 각 테스트가 @Transactional 또는 unique 시드로 처리한다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    public PostgreSQLContainer<?> postgresContainer() {
        return new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));
    }
}
