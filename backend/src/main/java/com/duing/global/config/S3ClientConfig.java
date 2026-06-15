package com.duing.global.config;

import com.duing.global.file.S3StorageProperties;
import java.net.URI;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;

/**
 * S3 호환 스토리지(R2 / MinIO / AWS S3) 클라이언트 설정.
 *
 * <p>{@code file.storage.provider=s3} 일 때만 활성. {@link S3StorageProperties} 는
 * 여기서만 등록되어 provider 가 s3 가 아닐 때는 빈 검증이 돌지 않는다 (local 까지 죽이는
 * 자살골 방지).
 *
 * <p>{@code region} 은 SDK 서명용. R2 데이터의 물리적 위치는 Cloudflare 콘솔에서
 * bucket 생성 시 Location = APAC 으로 분리.
 */
@Configuration
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "s3")
@EnableConfigurationProperties(S3StorageProperties.class)
public class S3ClientConfig {

    @Bean
    public S3Client s3Client(S3StorageProperties properties) {
        return S3Client.builder()
                .endpointOverride(URI.create(properties.endpoint()))
                .region(Region.of(properties.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(properties.accessKey(), properties.secretKey())))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .build())
                .build();
    }
}
