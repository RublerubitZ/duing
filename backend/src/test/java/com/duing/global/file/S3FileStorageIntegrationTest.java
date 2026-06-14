package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import java.net.URI;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MinIOContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

/**
 * L2 — MinIO Testcontainer 로 S3 API 라운드트립 검증.
 *
 * <p>test 프로파일 그대로 켠 채 {@code @DynamicPropertySource} 가 {@code file.storage.provider}
 * 를 stub 에서 s3 로 덮어쓴다. Stub 이 property 게이트라 비활성, S3FileStorageService 만 활성 —
 * test 프로파일 + 실제 S3 구현체 공존.
 *
 * <p>{@code webEnvironment = RANDOM_PORT} — 프로젝트의 다른 통합 테스트(FileApiTest 등)와
 * 일관성 유지. {@code NONE} 은 SecurityConfig 의 HttpSecurity 빈 의존성 때문에
 * 컨텍스트 부팅이 실패한다.
 */
@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class S3FileStorageIntegrationTest extends IntegrationTestBase {

    @Container
    static final MinIOContainer MINIO =
            new MinIOContainer("minio/minio:RELEASE.2025-09-07T16-13-09Z")
                    .withUserName("minioadmin")
                    .withPassword("minioadmin");

    @DynamicPropertySource
    static void overrideProps(DynamicPropertyRegistry registry) {
        registry.add("file.storage.provider", () -> "s3");
        registry.add("s3.endpoint", MINIO::getS3URL);
        registry.add("s3.region", () -> "us-east-1");
        registry.add("s3.access-key", () -> "minioadmin");
        registry.add("s3.secret-key", () -> "minioadmin");
        registry.add("s3.bucket", () -> "duing-test");
        registry.add("s3.public-base-url", () -> MINIO.getS3URL() + "/duing-test");
    }

    @BeforeAll
    static void createBucket() {
        try (S3Client adminClient = S3Client.builder()
                .endpointOverride(URI.create(MINIO.getS3URL()))
                .region(Region.US_EAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("minioadmin", "minioadmin")))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build()) {
            adminClient.createBucket(CreateBucketRequest.builder().bucket("duing-test").build());
        }
    }

    // 구체 타입 직접 참조 — L2 의 의도는 S3FileStorageService 내부 동작(endpoint 해석, key 추출)
    // 검증. CLAUDE.md 의 "인터페이스 타입 주입" 규칙은 운영 Controller/Service 대상이며 테스트는 제외.
    @Autowired
    S3FileStorageService service;

    @Autowired
    S3Client s3Client;

    @Test
    @DisplayName("실제 MinIO 에 업로드 후 객체 메타데이터의 Content-Type 이 image/webp 로 저장된다")
    void uploadStoresContentType() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.webp", "image/webp", new byte[]{1, 2, 3});

        String url = service.upload(file, "club/cover", "image/webp");
        String key = url.substring((MINIO.getS3URL() + "/duing-test/").length());

        String contentType = s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build()).contentType();
        assertThat(contentType).isEqualTo("image/webp");
    }

    @Test
    @DisplayName("동일 directory 에 두 번 업로드해도 UUID 가 다르므로 충돌하지 않는다")
    void uploadsToSameDirectoryDoNotCollide() {
        MockMultipartFile file1 = new MockMultipartFile(
                "file", "a.png", "image/png", new byte[]{1});
        MockMultipartFile file2 = new MockMultipartFile(
                "file", "b.png", "image/png", new byte[]{2});

        String url1 = service.upload(file1, "club/cover", "image/png");
        String url2 = service.upload(file2, "club/cover", "image/png");

        assertThat(url1).isNotEqualTo(url2);
    }

    @Test
    @DisplayName("업로드 후 반환된 URL 에서 prefix 를 제거하면 실제 객체 key 와 일치한다")
    void uploadedUrlKeyMatchesObjectKey() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        String url = service.upload(file, "club/cover", "image/png");
        String key = url.substring((MINIO.getS3URL() + "/duing-test/").length());

        // HeadObject 성공 = 객체 존재 = key 일치
        assertThat(s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build())).isNotNull();
    }

    @Test
    @DisplayName("업로드한 객체를 delete 호출 후 HeadObject 가 NoSuchKeyException 을 던진다")
    void deletedObjectIsActuallyGone() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});
        String url = service.upload(file, "club/cover", "image/png");
        String key = url.substring((MINIO.getS3URL() + "/duing-test/").length());

        service.delete(url);

        assertThatThrownBy(() -> s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build()))
                .isInstanceOf(NoSuchKeyException.class);
    }

    @Test
    @DisplayName("DB 에 박힌 다른 호스트 URL 을 delete 에 넘겨도 MinIO 에 영향을 주지 않는다")
    void deleteOfForeignUrlIsSafe() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});
        String url = service.upload(file, "club/cover", "image/png");
        String key = url.substring((MINIO.getS3URL() + "/duing-test/").length());

        service.delete("https://other-host.example/abc.png");

        assertThat(s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build())).isNotNull();
    }
}
