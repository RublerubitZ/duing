package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * 운영 잡 토글 정책 가드 — "운영 잡은 env 셋업 누락으로 조용히 꺼지면 안 된다"(application-prod.yml 관례).
 *
 * <p>base application.yml 의 duing.*.enabled 토글은 로컬/테스트 안전을 위해 기본 false 이고,
 * 운영은 application-prod.yml 이 ${ENV:true} 하드코딩으로 기본 활성을 보장한다. 이 관례가
 * 토글별 수동 반복이라 신규 잡·기존 잡(전례: notification.retention, fee 3종)이 prod 오버라이드를
 * 빠뜨린 채 배포되는 운영 갭이 실제로 있었다 — 이 테스트가 누락을 구조적으로 차단한다.
 *
 * <p>yml 은 소스 트리에서 직접 읽는다: 테스트 클래스패스의 application.yml 은
 * src/test/resources 사본이 섀도잉하므로 ClassPathResource 로는 운영 설정을 검증할 수 없다.
 */
class ProdJobTogglePolicyTest {

    private static final Path BASE_YML = Path.of("src/main/resources/application.yml");
    private static final Path PROD_YML = Path.of("src/main/resources/application-prod.yml");

    /** ${ENV_VAR:default} 플레이스홀더에서 default 를 뽑는다. 플레이스홀더가 아니면 리터럴 그대로. */
    private static final Pattern ENV_PLACEHOLDER = Pattern.compile("^\\$\\{[A-Za-z0-9_.-]+:(.*)}$");

    @Test
    @DisplayName("base 의 모든 duing.*.enabled 토글은 prod 프로파일에서 기본 활성(true 폴백)으로 귀결된다")
    void everyDuingToggleDefaultsToTrueInProd() throws IOException {
        Map<String, String> baseToggles = enabledToggles(BASE_YML);
        Map<String, String> prodToggles = enabledToggles(PROD_YML);

        assertThat(baseToggles).as("base duing.*.enabled 토글이 하나도 안 읽혔다 — 경로/파싱 확인").isNotEmpty();

        List<String> silentlyDisabledInProd = baseToggles.entrySet().stream()
                .filter(toggle -> {
                    String effectiveValue = prodToggles.getOrDefault(toggle.getKey(), toggle.getValue());
                    return !"true".equals(defaultOf(effectiveValue));
                })
                .map(Map.Entry::getKey)
                .toList();

        assertThat(silentlyDisabledInProd)
                .as("prod 에서 기본 비활성으로 남는 duing 토글 — application-prod.yml 에 ${ENV:true} "
                        + "오버라이드를 추가하거나, 의도적으로 꺼두는 것이면 이 테스트에 근거와 함께 예외를 명시하라")
                .isEmpty();
    }

    @Test
    @DisplayName("prod 의 duing.*.enabled 오버라이드는 전부 base 에 실재하는 토글이다 (개명·삭제 드리프트 방지)")
    void prodOverridesReferenceExistingBaseToggles() throws IOException {
        Map<String, String> baseToggles = enabledToggles(BASE_YML);
        Map<String, String> prodToggles = enabledToggles(PROD_YML);

        assertThat(prodToggles.keySet())
                .as("base 에 없는 키를 prod 가 오버라이드 중 — base 쪽 토글이 개명/삭제됐다면 prod 도 함께 정리하라")
                .isSubsetOf(baseToggles.keySet());
    }

    private Map<String, String> enabledToggles(Path ymlPath) throws IOException {
        Map<String, Object> root = new Yaml().load(Files.readString(ymlPath));
        Map<String, String> toggles = new LinkedHashMap<>();
        collectEnabledKeys(root.get("duing"), "duing", toggles);
        return toggles;
    }

    @SuppressWarnings("unchecked")
    private void collectEnabledKeys(Object node, String path, Map<String, String> toggles) {
        if (!(node instanceof Map)) {
            return;
        }
        for (Map.Entry<String, Object> entry : ((Map<String, Object>) node).entrySet()) {
            String childPath = path + "." + entry.getKey();
            if ("enabled".equals(entry.getKey()) && !(entry.getValue() instanceof Map)) {
                toggles.put(childPath, String.valueOf(entry.getValue()));
            } else {
                collectEnabledKeys(entry.getValue(), childPath, toggles);
            }
        }
    }

    private String defaultOf(String rawValue) {
        Matcher placeholder = ENV_PLACEHOLDER.matcher(rawValue);
        return placeholder.matches() ? placeholder.group(1) : rawValue;
    }
}
