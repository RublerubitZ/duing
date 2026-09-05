package com.duing.global.file.purge;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 업로드 고아 정리 크론을 활성화하는 설정 — {@code duing.upload.purge.enabled=true} 일 때만 {@code @EnableScheduling}
 * 으로 스케줄러를 켠다. 다른 잡 설정의 스케줄러에 무임승차하지 않고 자기 플래그만으로 독립 동작한다
 * ({@code FederationInquiryPurgeJobConfig} 와 동일 격리 패턴).
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "duing.upload.purge", name = "enabled", havingValue = "true")
public class UploadPurgeJobConfig {
}
