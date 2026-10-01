package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;

/**
 * 운영 프로파일 설정 가드(#1324) — 운영에서 꺼져 있어야 하는 설정이 base 변경이나 prod yml 정리로 조용히 켜지지 않게 한다.
 *
 * <p>yml 은 소스 트리에서 직접 읽는다: 테스트 클래스패스의 application.yml 은 src/test/resources 사본이 섀도잉하므로
 * 통합 테스트로는 운영 설정을 검증할 수 없다(전례: {@link DbServerErrorDetailPolicyTest}). 운영은 SPRING_PROFILES_ACTIVE=prod 라
 * application-prod.yml 이 base application.yml 을 덮으므로, 같은 순서로 쌓아 런타임과 같은 Binder 로 읽는다.
 * 플레이스홀더는 풀지 않으므로 {@code ${…}} 값은 불리언 변환에서 실패한다 — 이 키들은 리터럴로 고정한다.
 */
class ProdProfileConfigPolicyTest {

    private static final Path BASE_YML = Path.of("src/main/resources/application.yml");
    private static final Path PROD_YML = Path.of("src/main/resources/application-prod.yml");

    @Test
    @DisplayName("운영에서 API 문서(OpenAPI JSON·Swagger UI)는 꺼져 있다 — 키가 없으면 springdoc 기본값(켜짐)으로 본다")
    void prodDisablesApiDocs() throws IOException {
        Binder prod = prodBinder();

        // SecurityConfig 가 /v3/api-docs/**·/swagger-ui/** 를 permitAll 로 열어 두므로, 켜지면 전체 API 스키마가 인증 없이 공개된다.
        assertThat(prod.bind("springdoc.api-docs.enabled", Boolean.class).orElse(true))
                .as("springdoc.api-docs.enabled").isFalse();
        assertThat(prod.bind("springdoc.swagger-ui.enabled", Boolean.class).orElse(true))
                .as("springdoc.swagger-ui.enabled").isFalse();
    }

    @Test
    @DisplayName("운영에서 Flyway baseline-on-migrate 는 켜지지 않는다 — 이력 테이블이 없으면 baseline 을 찍지 말고 멈춰야 한다")
    void prodDoesNotBaselineOnMigrate() throws IOException {
        assertThat(prodBinder().bind("spring.flyway.baseline-on-migrate", Boolean.class).orElse(false))
                .as("spring.flyway.baseline-on-migrate").isFalse();
    }

    /** prod 문서를 앞에 둬 base 보다 우선하게 쌓는다 — 런타임의 프로파일 yml 우선순위와 같다. */
    private Binder prodBinder() throws IOException {
        List<PropertySource<?>> ymlDocuments = new ArrayList<>(load(PROD_YML));
        ymlDocuments.addAll(load(BASE_YML));
        return new Binder(ConfigurationPropertySources.from(ymlDocuments));
    }

    private List<PropertySource<?>> load(Path ymlPath) throws IOException {
        return new YamlPropertySourceLoader().load(ymlPath.toString(), new FileSystemResource(ymlPath));
    }
}
