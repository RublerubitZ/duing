package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
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
 * 운영 프로파일 설정 가드(#1324) — 운영에서 꺼져 있어야 하는 설정이 yml 정리로 조용히 켜지지 않게 한다.
 *
 * <p>yml 은 소스 트리에서 직접 읽는다: 테스트 클래스패스의 application.yml 은 src/test/resources 사본이 섀도잉하므로
 * 통합 테스트로는 운영 설정을 검증할 수 없다(전례: {@link DbServerErrorDetailPolicyTest}). 런타임의 ConfigData 병합
 * (다중 문서 순서·프로파일 그룹·import)은 재현하지 않으므로 운영 값은 application-prod.yml 단일 문서에 리터럴로 고정한다.
 * 서버 .env 로 들어오는 환경변수 덮어쓰기(예: SPRINGDOC_API_DOCS_ENABLED)는 이 가드 밖이다.
 *
 * <p>합법값이 하나뿐인 운영 값(인증 힌트 Cookie Domain)을 운영 yml 이 다시 필수 환경변수로 받지 않게도 한다(#1350).
 */
class ProdProfileConfigPolicyTest {

    private static final Path MAIN_RESOURCES = Path.of("src/main/resources");
    private static final Path PROD_YML = MAIN_RESOURCES.resolve("application-prod.yml");

    @Test
    @DisplayName("운영 yml 은 API 문서(OpenAPI JSON·Swagger UI)를 정확히 false 로 끈다 — springdoc 은 키가 없거나 off 여도 켠다")
    void prodDisablesApiDocs() throws IOException {
        List<PropertySource<?>> prodDocuments = load(PROD_YML);
        assertThat(prodDocuments).as("application-prod.yml 이 다중 문서(---)가 되면 병합 순서를 재현하도록 이 가드부터 고친다")
                .hasSize(1);
        Binder prod = new Binder(ConfigurationPropertySources.from(prodDocuments));

        // SecurityConfig 가 /v3/api-docs/**·/swagger-ui/** 를 permitAll 로 열어 두므로, 켜지면 전체 API 스키마가 인증 없이 공개된다.
        // springdoc 의 @ConditionalOnProperty(matchIfMissing = true) 는 값이 정확히 "false" 일 때만 끈다.
        assertThat(prod.bind("springdoc.api-docs.enabled", String.class).orElse(null))
                .as("springdoc.api-docs.enabled").isEqualToIgnoringCase("false");
        assertThat(prod.bind("springdoc.swagger-ui.enabled", String.class).orElse(null))
                .as("springdoc.swagger-ui.enabled").isEqualToIgnoringCase("false");
    }

    @Test
    @DisplayName("어느 설정 yml 도 Flyway baseline-on-migrate 를 켜지 않는다 — 이력 테이블이 없으면 baseline 을 찍지 말고 멈춰야 한다")
    void noConfigEnablesBaselineOnMigrate() throws IOException {
        List<Path> configYmls = configYmls();
        assertThat(configYmls).as("설정 yml 을 못 찾았다 — 경로 확인")
                .contains(MAIN_RESOURCES.resolve("application.yml"), PROD_YML);

        // 파일·문서마다 따로 본다 — 어느 프로파일(local 포함)이나 어느 문서에서든 켜면 실패한다.
        for (Path configYml : configYmls) {
            for (PropertySource<?> document : load(configYml)) {
                assertThat(new Binder(ConfigurationPropertySources.from(document))
                        .bind("spring.flyway.baseline-on-migrate", Boolean.class).orElse(false))
                        .as("%s 의 spring.flyway.baseline-on-migrate", configYml).isFalse();
            }
        }
    }

    @Test
    @DisplayName("운영 yml 은 인증 힌트 Cookie Domain 을 설정으로 받지 않는다 — 운영 값은 코드 상수라 환경변수가 없어도 기동한다")
    void prodDoesNotRequireHintCookieDomain() throws IOException {
        Binder prod = new Binder(ConfigurationPropertySources.from(load(PROD_YML)));

        // 합법값이 .duings.com 하나뿐인데 설정으로 받으면, 값이 비거나 틀린 .env 가 새 이미지와 자동 롤백 이미지를 함께 멈춘다(#1347 과 같은 함정).
        assertThat(prod.bind("web-auth.hint-cookie-domain", String.class).isBound())
                .as("web-auth.hint-cookie-domain").isFalse();
    }

    private List<Path> configYmls() throws IOException {
        List<Path> configYmls = new ArrayList<>();
        try (DirectoryStream<Path> matchedFiles = Files.newDirectoryStream(MAIN_RESOURCES, "application*.yml")) {
            matchedFiles.forEach(configYmls::add);
        }
        return configYmls;
    }

    private List<PropertySource<?>> load(Path ymlPath) throws IOException {
        return new YamlPropertySourceLoader().load(ymlPath.toString(), new FileSystemResource(ymlPath));
    }
}
