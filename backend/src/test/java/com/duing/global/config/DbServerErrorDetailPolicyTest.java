package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;

/**
 * pgjdbc 서버 오류 Detail 정책 가드(#1317) — 켜져 있으면 제약 위반 예외 메시지에 키·행 값(전화번호·학번 등)이 붙어
 * Hibernate ERROR 로그를 거쳐 Sentry 로 나간다.
 *
 * <p>yml 은 소스 트리에서 직접 읽는다: 테스트 클래스패스의 application.yml 은 src/test/resources 사본이 섀도잉하므로
 * 통합 테스트로는 운영 설정을 검증할 수 없다(전례: {@link ProdJobTogglePolicyTest}). 중복 키는 Spring 처럼 거부한다 —
 * 마지막 키가 이기는 SnakeYAML 기본값으로 읽으면, 기동이 실패할 yml 도 이 테스트는 통과한다.
 */
class DbServerErrorDetailPolicyTest {

    private static final Path BASE_YML = Path.of("src/main/resources/application.yml");
    private static final Path TEST_YML = Path.of("src/test/resources/application.yml");
    private static final List<Path> PROFILE_YMLS = List.of(
            Path.of("src/main/resources/application-prod.yml"),
            Path.of("src/main/resources/application-local.yml"));
    private static final List<String> SETTING_PATH =
            List.of("spring", "datasource", "hikari", "data-source-properties", "logServerErrorDetail");

    @Test
    @DisplayName("base 와 테스트 설정은 pgjdbc 서버 오류 Detail 을 끈다")
    void baseAndTestConfigDisableServerErrorDetail() throws IOException {
        assertThat(logServerErrorDetailOf(BASE_YML)).as("base application.yml").isEqualTo(false);
        assertThat(logServerErrorDetailOf(TEST_YML)).as("테스트 application.yml").isEqualTo(false);
    }

    @Test
    @DisplayName("prod·local 프로파일은 서버 오류 Detail 을 다시 켜지 않는다 — 키가 없으면 base 의 false 를 따른다")
    void profilesDoNotReEnableServerErrorDetail() throws IOException {
        for (Path profileYml : PROFILE_YMLS) {
            assertThat(Objects.toString(logServerErrorDetailOf(profileYml), "false"))
                    .as("%s 가 logServerErrorDetail 을 덮어쓴다", profileYml)
                    .isEqualTo("false");
        }
    }

    @SuppressWarnings("unchecked")
    private Object logServerErrorDetailOf(Path ymlPath) throws IOException {
        LoaderOptions loaderOptions = new LoaderOptions();
        loaderOptions.setAllowDuplicateKeys(false);
        Object node = new Yaml(loaderOptions).load(Files.readString(ymlPath));
        for (String key : SETTING_PATH) {
            if (!(node instanceof Map)) {
                return null;
            }
            node = ((Map<String, Object>) node).get(key);
        }
        return node;
    }
}
