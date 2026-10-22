package com.duing.global.config;

import com.fasterxml.jackson.core.JsonParser;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 공용 ObjectMapper 설정.
 * <p>요청 본문 JSON 의 같은 키 반복을 파싱 단계에서 거절한다(#1488) — 거절하지 않으면 레코드 DTO 의 생성자 인자를 다 채운 뒤
 * 반복된 키가 500 이 되고, 앞쪽 반복은 조용히 뒤 값이 이긴다. 거절은 HttpMessageNotReadableException 이라 기존 400 으로 간다.
 * yml 대신 여기 두는 이유: 테스트 application.yml 이 운영 yml 을 대체해 한쪽만 바뀌는 일을 막는다.
 * 공용 매퍼로 외부 JSON 을 읽는 곳(학교 시설 크롤러)은 통제할 수 없는 응답이라 그쪽은 파서에서 이 검사를 끄고 읽는다.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer strictDuplicateDetection() {
        return builder -> builder.featuresToEnable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
    }
}
