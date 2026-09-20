package com.duing.global.file.purge;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * {@link UploadPurgeProperties} 를 무조건 등록한다({@code FederationInquiryPurgePropertiesConfig} 전례).
 * {@link UploadPurgeJob} 은 잡이 비활성일 때도 properties 를 읽어 early-return 하므로 바인딩은 항상 유지한다.
 * 스케줄링 활성화는 {@link UploadPurgeJobConfig} 가 {@code duing.upload.purge.enabled=true} 일 때만 켠다.
 */
@Configuration
@EnableConfigurationProperties(UploadPurgeProperties.class)
public class UploadPurgePropertiesConfig {
}
