package com.duing.global.frontend;

import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 프론트 재생성 트리거 RestClient — {@link FrontendRevalidator} 가 사용.
 *
 * <p>read 타임아웃을 25초로 둔다 — 응답 첫 바이트를 기다리는 무활동 시간에도 걸리는 값이다. 재검증 라우트는 캐시를
 * 지우기 전 사전 확인(공개 목록·상세 조회 1건)을 마친 뒤에야 응답하는데, 그 조회의 최악이 20초다(프론트 서버
 * 클라이언트의 헤더 10초 + 본문 읽기 10초, #1375). warm-up GET 이 기다리는 페이지 재생성도 같은 클라이언트로 돌아
 * 상한이 같다 — 목록(/clubs)은 조회 1건, 상세는 상세·대표 활동 조회를 병렬로 돈다(#1457). 25초는 여기에 콜드스타트·응답
 * 여유를 더한 값이다. 이 계산은 요청 1건에 경로 1개라는 전제다({@link FrontendRevalidator} 는 항상 하나만 보낸다) —
 * 라우트는 경로별 사전 확인을 순차로 돌므로 경로를 묶어 보내게 되면 이 상한도 다시 정한다. 호출은 정각 스케줄
 * 스레드(시간당 1회)·매일 00:05 상세 재생성 잡({@code ClubDetailDailyRevalidationJob})의 스케줄 스레드와 동아리 상세
 * 재생성 전용 실행기({@link FrontendRevalidationAsyncConfig}, 단일 스레드), 기동 뒤 로고 썸네일 백필({@code ClubLogoThumbnailBackfillRunner}
 * — 썸네일 실행기 스레드에서 동아리마다 순차)에서만 나가 요청 스레드 예산과 무관하다.
 * 비활성(주소·비밀값 없음)일 때도 빈은 만들어 두되 더미 로컬 주소를 준다 — FrontendRevalidator 가 먼저 걸러
 * 절대 호출되지 않는다.
 */
@Configuration
@EnableConfigurationProperties(FrontendRevalidationProperties.class)
public class FrontendRevalidationClientConfig {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(25);
    private static final String DISABLED_BASE_URL = "http://localhost:0/frontend-revalidation-disabled";

    @Bean
    public RestClient frontendRevalidationRestClient(FrontendRevalidationProperties frontendRevalidationProperties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        return RestClient.builder()
                .baseUrl(frontendRevalidationProperties.enabled()
                        ? frontendRevalidationProperties.baseUrl()
                        : DISABLED_BASE_URL)
                .requestFactory(requestFactory)
                .build();
    }
}
