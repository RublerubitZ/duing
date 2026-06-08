package com.duing.common;

import org.springframework.boot.autoconfigure.jdbc.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * 통합 테스트용 PostgreSQL Testcontainer.
 *
 * <p>@SpringBootTest 클래스에 @Import(TestcontainersConfiguration.class) 를 붙이면
 * Spring Boot 가 자동으로 spring.datasource.* 를 컨테이너 값으로 덮어쓴다.
 *
 * <p>컨테이너는 JVM 라이프타임 동안 단 1회만 기동된다 (static 필드).
 *
 * <p><b>Lifecycle 우회</b>: 이전 버전은 {@code @Bean @ServiceConnection PostgreSQLContainer}
 * 로 컨테이너 자체를 빈으로 노출했으나, Spring Boot 의 {@code TestcontainersLifecycleBeanPostProcessor}
 * 가 {@code Startable} 타입 빈을 context 종료 시 자동으로 {@code stop()} 한다. 다음 context
 * 가 만들어질 때 {@code GenericContainer.start()} 가 새로 호출되면 Testcontainers 는 새 Docker
 * 컨테이너를 띄운다. 결과적으로 static 참조는 같지만 매 context = 매 Docker 컨테이너가 됐다
 * (실측 260 context = 259 unique JDBC URL). 이를 회피하기 위해 컨테이너를 빈으로 노출하지 않고
 * {@link JdbcConnectionDetails} 만 노출한다. {@code JdbcConnectionDetails} 는 {@code Startable}
 * 이 아니므로 lifecycle BPP 가 건드리지 않으며, Spring Boot 의 {@code DataSourceAutoConfiguration}
 * 이 이 빈을 우선 사용해 DataSource 를 구성한다.
 *
 * <p>데이터 격리는 각 테스트가 @Transactional rollback 또는 @BeforeEach truncate 로 처리한다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse("postgres:16-alpine"));

    static {
        POSTGRES.start();
    }

    @Bean
    JdbcConnectionDetails postgresConnectionDetails() {
        return new JdbcConnectionDetails() {
            @Override
            public String getJdbcUrl() {
                return POSTGRES.getJdbcUrl();
            }

            @Override
            public String getUsername() {
                return POSTGRES.getUsername();
            }

            @Override
            public String getPassword() {
                return POSTGRES.getPassword();
            }

            @Override
            public String getDriverClassName() {
                return POSTGRES.getDriverClassName();
            }
        };
    }
}
