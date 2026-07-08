package com.duing.global.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.web.config.PageableHandlerMethodArgumentResolverCustomizer;

/**
 * 페이지네이션 전역 상한 설정.
 *
 * <p>목록 조회 API 전반(공개·관리자)의 페이지 size 를 {@value #MAX_PAGE_SIZE} 로 클램프한다. 클라이언트가
 * 그보다 큰 size 를 요청해도 이 값으로 잘려, Spring 기본 상한(2000)으로 인한 대량 조회·메모리 부하를 막는다.
 */
@Configuration
public class PageableConfig {

    public static final int MAX_PAGE_SIZE = 100;

    @Bean
    PageableHandlerMethodArgumentResolverCustomizer pageableMaxSizeCustomizer() {
        return resolver -> resolver.setMaxPageSize(MAX_PAGE_SIZE);
    }
}
