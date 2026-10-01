package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.FileSystemResource;

/**
 * pgjdbc 서버 오류 Detail 정책 가드(#1317) — 켜져 있으면 제약 위반 예외 메시지에 키·행 값(전화번호·학번 등)이 붙어
 * Hibernate ERROR 로그를 거쳐 Sentry 로 나간다.
 *
 * <p>yml 은 소스 트리에서 직접 읽는다: 테스트 클래스패스의 application.yml 은 src/test/resources 사본이 섀도잉하므로
 * 통합 테스트로는 운영 설정을 검증할 수 없다(전례: {@link ProdJobTogglePolicyTest}). 읽기·해석은 런타임과 같은 Spring 의
 * YamlPropertySourceLoader 와 Binder 로 한다 — 중복 키는 기동처럼 거부되고, {@code dataSourceProperties:} 나 점 표기 키처럼
 * 철자가 달라도 같은 설정으로 잡힌다. 플레이스홀더는 풀지 않으므로 {@code ${…}} 값은 "false" 가 아니라 실패한다.
 */
class DbServerErrorDetailPolicyTest {

    private static final Path MAIN_RESOURCES = Path.of("src/main/resources");
    private static final Path BASE_YML = MAIN_RESOURCES.resolve("application.yml");
    private static final Path TEST_YML = Path.of("src/test/resources/application.yml");
    private static final String DATA_SOURCE_PROPERTIES = "spring.datasource.hikari.data-source-properties";
    private static final String SERVER_ERROR_DETAIL = "logServerErrorDetail";

    @Test
    @DisplayName("base 와 테스트 설정은 pgjdbc 서버 오류 Detail 을 끈다")
    void baseAndTestConfigDisableServerErrorDetail() throws IOException {
        assertThat(dataSourcePropertiesOf(BASE_YML)).as("base application.yml")
                .containsEntry(SERVER_ERROR_DETAIL, "false");
        assertThat(dataSourcePropertiesOf(TEST_YML)).as("테스트 application.yml")
                .containsEntry(SERVER_ERROR_DETAIL, "false");
    }

    @Test
    @DisplayName("어느 프로파일 yml 도 서버 오류 Detail 을 다시 켜지 않는다 — 키가 없으면 base 의 false 를 따른다")
    void profilesDoNotReEnableServerErrorDetail() throws IOException {
        List<Path> profileYmls = profileYmls();
        assertThat(profileYmls).as("application-*.yml 을 하나도 못 찾았다 — 경로 확인").isNotEmpty();

        for (Path profileYml : profileYmls) {
            assertThat(dataSourcePropertiesOf(profileYml).getOrDefault(SERVER_ERROR_DETAIL, "false"))
                    .as("%s 에서 %s 을 false 가 아닌 값으로 덮어쓴다", profileYml, SERVER_ERROR_DETAIL)
                    .isEqualTo("false");
        }
    }

    private List<Path> profileYmls() throws IOException {
        List<Path> profileYmls = new ArrayList<>();
        try (DirectoryStream<Path> matchedFiles = Files.newDirectoryStream(MAIN_RESOURCES, "application-*.yml")) {
            matchedFiles.forEach(profileYmls::add);
        }
        return profileYmls;
    }

    private Map<String, String> dataSourcePropertiesOf(Path ymlPath) throws IOException {
        List<PropertySource<?>> ymlDocuments =
                new YamlPropertySourceLoader().load(ymlPath.toString(), new FileSystemResource(ymlPath));
        return new Binder(ConfigurationPropertySources.from(ymlDocuments))
                .bind(DATA_SOURCE_PROPERTIES, Bindable.mapOf(String.class, String.class))
                .orElse(Map.of());
    }
}
