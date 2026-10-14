package com.duing.common;

import org.springframework.boot.autoconfigure.jdbc.JdbcConnectionDetails;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.NoOpTaskScheduler;
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
 *
 * <p><b>크론은 등록만 하고 실행하지 않는다(#1442)</b>: 잡 플래그를 켠 컨텍스트는 캐시에 남아 있는 동안 실제 스케줄러가
 * 크론을 돌려, 다른 테스트의 {@code IntegrationTestBase} TRUNCATE 와 교착했다(다른 테스트가 심은 데이터를 처리할 수도 있었다).
 * 그래서 이 설정이 Spring 의 {@code NoOpTaskScheduler}(작업을 실행하지 않고 취소된 future 를 돌려준다)를
 * {@code TaskScheduler} 빈으로 준다. 스케줄링이 켜지면 Spring 의
 * {@code TaskSchedulerRouter} 가 유일한 {@code TaskScheduler} 빈을 골라 쓰고(Boot 는 이 빈이 있으면 기본 스케줄러를
 * 만들지 않는다), {@code @Scheduled} 작업은 {@code ScheduledTaskHolder} 에 등록된 채 실행되지 않는다. 등록 검증
 * 테스트는 그대로 돌고, 잡 테스트는 잡 메서드를 직접 호출한다(가드: {@code ClubMetricScheduleRegistrationTest}).
 * 공유 DB 를 쓰는 컨텍스트 전부에 예외 없이 걸려야 해서 여기에 둔다 — {@link FixedClockConfig} 를 여기에 두지 않은
 * 이유와 반대로, 이 빈은 전체에 거는 것이 목적이다. 스케줄링이 꺼진 컨텍스트에서는 쓰이지 않고, 같은 설정 클래스라
 * 컨텍스트 캐시 키도 바뀌지 않는다.
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

    @Bean
    TaskScheduler taskScheduler() {
        return new NoOpTaskScheduler();
    }
}
