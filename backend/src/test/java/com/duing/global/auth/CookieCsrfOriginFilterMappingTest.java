package com.duing.global.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Origin 을 요구하는 열람 감사 경로 목록의 드리프트 가드 — 컨트롤러 경로 이름이 바뀌었는데 목록을 안 고치면
 * 그 경로의 Origin 요구가 조용히 꺼진다(#1321 L-1).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CookieCsrfOriginFilterMappingTest {

    // actuator 의 controllerEndpointHandlerMapping 도 같은 타입이라 이름으로 고른다.
    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping handlerMapping;

    @Test
    @DisplayName("Origin 을 요구하는 열람 감사 경로는 모두 실제 GET 핸들러 경로와 글자 그대로 같다")
    void auditedReadPathsMatchRealGetHandlers() {
        Set<String> getHandlerPatterns = handlerMapping.getHandlerMethods().keySet().stream()
                .filter(mappingInfo -> mappingInfo.getMethodsCondition().getMethods().contains(RequestMethod.GET))
                .flatMap(mappingInfo -> mappingInfo.getPatternValues().stream())
                .collect(Collectors.toSet());

        assertThat(getHandlerPatterns).containsAll(CookieCsrfOriginFilter.AUDITED_READ_PATHS);
    }
}
