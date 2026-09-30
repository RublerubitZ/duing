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
import org.testcontainers.utility.DockerImageName;
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

    // 공식 minio/minio 배포가 끊겼다 — Docker Hub 저장소가 2026-09 초에 사라졌고, 대신 쓰던 quay.io/minio/minio 도
    // 2026-09-26 기준 인증을 요구한다(401). 공개로 받을 수 있는 Chainguard 빌드(amd64·arm64, 진입점이 minio 바이너리라
    // Testcontainers 의 `server /data` 명령이 그대로 동작)를 다이제스트로 고정해 쓴다. 무료 티어는 latest 태그만 제공하므로
    // 태그 대신 다이제스트로 핀하고, 이 다이제스트가 사라지면 같은 방법으로 새 다이제스트를 받아 교체한다.
    // 기본 이미지명이 아니라 asCompatibleSubstituteFor 로 호환 선언이 필요하다. CI 의 사전 pull(backend-ci.yml)도 같은 참조를 써야 한다.
    @Container
    static final MinIOContainer MINIO =
            new MinIOContainer(DockerImageName.parse("cgr.dev/chainguard/minio@sha256:bd014394a80898e68c149f2311fdf8d5a2c2f3bb2c33b9327ae6d02b4b065ae1")
                    .asCompatibleSubstituteFor("minio/minio"))
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
    @DisplayName("실제 MinIO 에 업로드된 객체의 Content-Disposition 이 inline, Cache-Control 이 immutable 로 저장된다")
    void uploadStoresInlineDispositionAndCacheControl() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1, 2, 3});

        String url = service.upload(file, "club/logo", "image/png");
        String key = url.substring((MINIO.getS3URL() + "/duing-test/").length());

        var head = s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build());
        assertThat(head.contentDisposition()).isEqualTo("inline");
        assertThat(head.cacheControl()).isEqualTo("public, max-age=31536000, immutable");
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

        assertThat(service.delete(url)).isTrue(); // 실 스토리지 삭제 성공 = 삭제 확정

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

        assertThat(service.delete("https://other-host.example/abc.png")).isFalse(); // 관리 밖 URL = 삭제 미확정

        assertThat(s3Client.headObject(HeadObjectRequest.builder()
                .bucket("duing-test").key(key).build())).isNotNull();
    }
}
