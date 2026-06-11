# Cloudflare R2 Storage 도입 — Design

> 기존 `FileStorageService` 추상화 위에 S3 호환 구현체 하나를 추가해 운영 파일 스토리지를 Cloudflare R2 로 전환한다. 동시에 운영 프로파일이 silently `/tmp` 로 빠지던 설정 버그를 같이 해결하고, 사용하지 않던 Supabase Storage 구현체를 제거한다.

- 작성일: 2026-06-10
- 전제: 실서비스 전. R2 에는 아직 객체 0개, DB 의 일부 URL 컬럼에는 local /tmp 또는 Supabase URL 이 박혀 있을 가능성 있음 (마이그레이션은 별도 PR)
- 선행: 없음 (`FileStorageService` 추상화는 이미 존재 — `backend/CLAUDE.md` "확장성 원칙")

> **갱신 (2026-06-11):** 수동 개발용 `local-minio` 프로파일(`application-local-minio.yml`)과
> `backend/docker-compose.yml` 은 제거됐다. 일상 개발은 R2 dev 버킷을 직접 가리키는
> `FILE_STORAGE_PROVIDER=s3` 로 하고(운영과 동일한 S3 경로를 매일 검증), R2 자격증명이 없거나
> 오프라인일 때는 `local` (`/tmp`) 폴백을 쓴다. MinIO 는 더 이상 수동 개발 인프라가 아니며,
> CI 통합 테스트(L2 `S3FileStorageIntegrationTest`)의 자체 `MinIOContainer` TestContainer 로만 남는다.
> 아래 본문의 `local-minio` 프로파일·`docker-compose` 관련 서술은 이 결정 이전의 기록이다.

---

## 1. Goal & Non-Goals

### Goal
- 운영 파일 스토리지를 Cloudflare R2 로 전환 (egress 무료, S3 호환, 향후 AWS S3 로도 이주 자유)
- 운영 프로파일이 `file.storage.provider` 미설정으로 `/tmp` 에 떨어지던 버그 해결 + 재발 방지 안전장치 도입
- 로컬 개발에서 R2/S3 코드 경로를 검증할 수 있도록 MinIO 프로파일 추가
- 사용하지 않는 `SupabaseStorageFileStorageService` 및 설정 완전 제거

### Non-Goals (Out of Scope)
이번 PR 이 만들지 않는 변경 = 후속 PR 의 정체성:
- 인터페이스 시그니처 `String upload(MultipartFile, String): String` 의 반환을 **URL → key** 로 변경
- `FileUploadResponse` 의 `storageKey` 가 실제 key 가 되도록 (현재는 둘 다 full URL — 네이밍 거짓말 해소)
- `ClubPhoto.storage_key`, `Notice.cover_image_url`, `Promotion.banner_image_url` 등 도메인 컬럼 정책 통일 + 데이터 마이그레이션
- 호스트 혼재 데이터 처리 (DB 에 Supabase / local /tmp / R2 URL 이 섞여있을 가능성에 대한 일괄 마이그레이션)
- Presigned URL (브라우저 직업로드) — 동영상/큰 파일 도입 시점에 재검토
- 비공개 자산 (면접 첨부 등) private bucket + presigned GET
- `ClubPhoto` 스펙 §3.2d 의 storage cleanup job (Phase 5)
- R2 bucket lifecycle 정책 (오래된 객체 archive 등)
- `FileController.validate` 의 빈 파일 → 400 분리 (현재 500 wart — Local/Supabase 도 동일)

---

## 2. Architecture Overview

### 빈 활성화 메커니즘

`FileStorageService` 인터페이스 위에 두 구현체. 활성화는 `file.storage.provider` 단일 스위치로 통일.

```
file.storage.provider  →  활성 빈                      →  타깃
─────────────────────     ──────────────────────────     ──────────────
local (default)           LocalFileStorageService        /tmp/duing/uploads
s3                        S3FileStorageService           R2 또는 MinIO
                                                         (s3.endpoint 가 결정)
stub (test 프로파일)       StubFileStorageService         no-op
```

- 모든 구현체 활성화는 `@ConditionalOnProperty(name="file.storage.provider", havingValue=...)` 로 통일
- **`LocalFileStorageService` 만 `matchIfMissing=true`** — property 누락 시 부팅을 깨지 않기 위한 기본값
- 기존 `@Profile("local")` / `@Profile("test")` 제약은 제거 (provider 만으로 충분)

### Silent fallback 안전장치

`matchIfMissing=true` 가 바로 "prod 가 조용히 `/tmp` 로 빠지던 버그" 의 원인. prod yml 에 `provider: s3` 를 명시해서 1차 차단, **이중 게이트로 다음을 추가:**

1. **Startup 경고 로그**: `LocalFileStorageService` 생성자에서 `log.warn("Active storage backend = LOCAL (root={})", rootDir)`. prod 로그에 WARN 한 줄 = 즉시 빨간불.
2. **`@Validated + @NotBlank` fail-fast**: `provider=s3` 인데 credential 누락 시 컨테이너 startup 실패 (silent 진행 불가). 이 게이트는 `S3StorageProperties` 가 `S3ClientConfig` 안에서만 `@EnableConfigurationProperties` 로 등록되어 **s3 활성 상태에서만 발동** (local 까지 죽이지 않음).

S3 구현체는 정상이므로 INFO: `log.info("Active storage backend = S3 (endpoint={}, bucket={})", endpoint, bucket)`.

### 환경별 매핑

| 환경 | provider | endpoint (업로드용) | base URL (공개 URL용) |
|---|---|---|---|
| local (기본) | `local` | — | `http://localhost:8080` (정적 서빙) |
| local-minio | `s3` | `http://localhost:9000` | `http://localhost:9000/duing` |
| prod | `s3` | `https://<account>.r2.cloudflarestorage.com` | `https://files.duing.app` |
| test | `stub` | — | — |

> `endpoint` 는 S3 PutObject API 호출 대상, `base-url` 은 브라우저가 `<img src>` 로 GET 하는 호스트. R2 는 두 값이 다름, MinIO 는 사실상 같음.

---

## 3. Components

### 신규

**(1) `S3FileStorageService implements FileStorageService`**
- 위치: `backend/src/main/java/com/duing/global/file/S3FileStorageService.java`
- 활성화: `@ConditionalOnProperty(name="file.storage.provider", havingValue="s3")`
- 의존: `S3Client` (AWS SDK v2), `S3StorageProperties`
- `upload()` 책임:
  - `directory + "/" + UUID + extension` 으로 key 합성
  - `PutObjectRequest` (bucket, key, **`contentType` 명시 — 누락 시 `<img>` 가 다운로드됨**) + `RequestBody.fromBytes(file.getBytes())`
  - **`fromInputStream` 사용 금지** — AWS SDK v2 가 서명/재시도 시 body 를 재읽기 함, non-resettable InputStream 은 간헐적 실패. 5MB 상한이라 byte[] 전체 적재 안전. 동영상 도입 시 OOM 트리거 = presigned 전환 신호 (Out of Scope)
  - 반환: `props.publicBaseUrl() + "/" + key`
- `delete()` 책임:
  - `prefix = props.publicBaseUrl() + "/"` (★ trailing slash 포함 — 누락 시 leading slash 잔존으로 잘못된 키 삭제/no-op)
  - `startsWith(prefix)` 매칭 실패 시 `log.warn("외부 storage URL 스킵 — prefix 불일치")` (URL 자체 미기록) + return
  - `DeleteObjectRequest` 호출, `SdkException` 은 `log.warn("S3 Storage 삭제 실패: key={}", key, ex)` 후 swallow (도메인 트랜잭션 정상 커밋)
- 생성자에 startup 로그: `log.info("Active storage backend = S3 (...)")`

**(2) `S3ClientConfig`**
- 위치: `backend/src/main/java/com/duing/global/config/S3ClientConfig.java`
- 활성화 + 등록 범위 (★ 명시):
  ```java
  @Configuration
  @ConditionalOnProperty(name="file.storage.provider", havingValue="s3")
  @EnableConfigurationProperties(S3StorageProperties.class)   // ★ 여기서만 등록
  public class S3ClientConfig { ... }
  ```
- `@ConfigurationPropertiesScan` 전역 등록 **금지** — local 프로파일에서 빈 문자열 default 가 `@NotBlank` 위반하여 부팅을 깨는 자살골
- `S3Client` 빈:
  - `endpointOverride(URI.create(props.endpoint()))`
  - `region(Region.of(props.region()))`
  - `StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey))`
  - `S3Configuration.builder().pathStyleAccessEnabled(true).build()` (R2/MinIO 둘 다 path-style 권장)
- `region` 은 **SDK 서명용**. R2 데이터의 물리적 위치는 Cloudflare 콘솔에서 bucket 생성 시 **Location = APAC** 으로 분리 (인프라 전제 §8.2)

**(3) `S3StorageProperties` (record)**
- 위치: `backend/src/main/java/com/duing/global/file/S3StorageProperties.java`
- 정의:
  ```java
  @Validated
  @ConfigurationProperties(prefix = "s3")
  public record S3StorageProperties(
      @NotBlank String endpoint,
      @NotBlank String region,
      @NotBlank String accessKey,
      @NotBlank String secretKey,
      @NotBlank String bucket,
      @NotBlank String publicBaseUrl
  ) {
      public S3StorageProperties {
          // trailing slash 정규화 — 저장된 값은 항상 슬래시 없음, prefix 합성 시 1번 붙임
          publicBaseUrl = stripTrailingSlash(publicBaseUrl);
      }
  }
  ```
- **`@Validated` 필수** — 없으면 JSR-380 검증 안 발동, "silent fallback 근절" 약속이 거짓말. `hibernate-validator` 는 `spring-boot-starter-validation` (build.gradle.kts:33) 으로 이미 classpath
- **`@Component` / `@ConfigurationPropertiesScan` 금지** — (2) 의 `@EnableConfigurationProperties` 로만 등록

### 수정

**(4) `LocalFileStorageService`**
- `@Profile("local")` 제거
- `@ConditionalOnProperty(name="file.storage.provider", havingValue="local", matchIfMissing=true)` 추가
- 생성자 startup 로그: `log.warn("Active storage backend = LOCAL (root={})", rootDir)`

**(5) `LocalFileServingConfig`**
- `@Profile("local")` → `@ConditionalOnProperty(name="file.storage.provider", havingValue="local", matchIfMissing=true)`

**(6) `application.yml`**
- `supabase:` 섹션 삭제
- `s3:` 섹션 신설 (모든 값 환경변수 주입, 하드코딩 0)
- 주석 `# local | supabase` → `# local | s3`

**(7) `application-prod.yml`**
- `file.storage.provider: s3` 명시 (★ 현 버그 해소)
- `s3.public-base-url: https://files.duing.app` 고정 (시크릿 아님)
- credential 3종은 GitHub Secret → env (`R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`)

### 신규 (인프라)

**(8) `application-local-minio.yml`**
- `spring.profiles.active` **적지 않음** (profile-specific 문서에서 active 지정 시 `InvalidConfigDataPropertyException`)
- `provider: s3` + s3 블록 (endpoint/credential/bucket/public-base-url) 만
- datasource 는 `local` 프로파일이 제공 → 실행 시 `SPRING_PROFILES_ACTIVE=local,local-minio` 로 둘 다 활성 (뒤가 우선 → provider=s3 확정)

**(9) `backend/docker-compose.yml`** (모노레포에 미존재 → 신규)
- 위치: **`backend/` 디렉토리 안** (백엔드 작업과 1:1, `./gradlew bootRun` 과 같은 디렉토리에서 `docker compose up`)
- MinIO + `mc` initContainer (bucket 생성 + `mc anonymous set download` ★ — 둘째 단계 누락 시 로컬 GET 403)
- postgres 는 포함 안 함 (기존 개발자 환경 존중, 각자 별도 띄움)
- **이미지 버전 핀 필수** (기존 `TestcontainersConfiguration` 의 `postgres:16-alpine` 핀 컨벤션 일관): `minio/minio:latest`, `minio/mc:latest` 금지. 구체 안정 태그(`RELEASE.YYYY-MM-DDTHH-MM-SSZ`)는 구현 시점 최신 안정판으로 박음. `:latest` 사용 시 MinIO 가 breaking 이미지 publish 하면 CI 가 코드 변경 없이 갑자기 깨짐 → 재현 불가능

**(10) `build.gradle.kts`**
- 기존 `dependencyManagement.imports` 블록에 mavenBom 추가:
  ```kotlin
  mavenBom("software.amazon.awssdk:bom:2.x.x")   // 작업 시점 최신 안정판
  ```
- `dependencies` 에:
  ```kotlin
  implementation("software.amazon.awssdk:s3")
  testImplementation("org.testcontainers:minio")  // 버전은 기존 testcontainers-bom 1.20.4 관리
  ```
- `implementation(platform(...))` 병행 도입 **금지** (기존 컨벤션 일관성)

### 제거

**(11) `SupabaseStorageFileStorageService` + 관련**
- 클래스 파일, `supabase:` yml 블록, 관련 import, 관련 의존성 (RestTemplate 은 Spring 기본 — 별도 제거 불필요)
- 제거 전 prod DB 의 Supabase URL 잔존 여부 점검 (있어도 이번 PR 은 안 건드림, 후속 마이그레이션 PR 책임)

### 인터페이스 (변경 없음, 명시)

- `FileStorageService.upload(MultipartFile, String): String` — full URL 반환 그대로
- `FileStorageService.delete(String): void` — 그대로
- `FileController`, `FilePurpose`, `FileUploadResponse`, 도메인 호출부 (`ClubPhotoCommandService` 등) — **수정 없음**

---

## 4. Data Flow

### 업로드 (POST /api/v1/files)

```
Browser → FileController.upload
         ├─ validate(file)          // size ≤ 5MB, MIME ∈ {jpeg,png,webp}
         │                          // 실패 시 400, S3 호출 안 함
         └─ fileStorageService.upload(file, purpose.directory())
            S3FileStorageService:
            ├─ key = directory + "/" + UUID + ext
            ├─ PutObjectRequest(bucket, key, contentType=file.getContentType())
            ├─ body = RequestBody.fromBytes(file.getBytes())
            └─ return props.publicBaseUrl() + "/" + key
         → 201 { storageKey: <url>, url: <url> }  // 둘 다 같은 full URL (현 동작 그대로)
```

**핵심 불변량:**
- 검증은 controller 에서 먼저 (S3 호출 전 fail-fast)
- 반환은 **full URL** (인터페이스 불변)
- key 형식: `{FilePurpose.directory()}/{UUID}.{ext}` — 동적 prefix(clubId 등) 없음
- 트랜잭션: `upload()` 은 도메인 트랜잭션 밖. 저장 실패 시 객체는 R2 에 남음 → cleanup job (Out of Scope) 책임

### 삭제

```
도메인 Service → fileStorageService.delete(fileUrl)
                 S3FileStorageService:
                 ├─ prefix = props.publicBaseUrl() + "/"   // ★ trailing slash 필수
                 ├─ if (!fileUrl.startsWith(prefix)) → log.warn + return
                 ├─ key = fileUrl.substring(prefix.length())   // leading slash 없음
                 └─ DeleteObjectRequest(bucket, key)
                    SdkException → log.warn(key) + swallow
```

- prefix 불일치 = DB 에 다른 스토리지 URL 잔존 가능성 (현실적 — prod 가 한동안 /tmp 로 빠졌음). 무시 + warn 으로 도메인 트랜잭션은 정상 커밋
- 삭제 실패도 swallow — 객체 고아 + DB 정상의 비대칭은 cleanup job 이 흡수

### 공개 URL 조회 (`<img src>`)

```
prod:        Browser → https://files.duing.app/club/cover/{uuid}.webp
                    → Cloudflare CDN (custom domain 바인딩된 R2 bucket)
                    → 200 image/webp  (egress 무료)

local-minio: Browser → http://localhost:9000/duing/club/cover/{uuid}.webp
                    → MinIO (anonymous download 정책)

local:       Browser → http://localhost:8080/files/club/cover/{uuid}.webp
                    → Spring (LocalFileServingConfig)
```

- **백엔드는 이미지 GET 경로에 끼지 않음** (prod/local-minio) → egress 무료/CDN 캐싱 활용
- DB 의 값은 full URL → 환경 간 데이터 이동 시 base URL 치환 필요 (Out of Scope, 인지)

### 도메인 호출부 (변경 없음)

`ClubPhotoCommandService.create` 등 흐름은 한 줄도 안 바뀜. `storage_key` 컬럼에 들어가는 URL 의 호스트만 `files.duing.app` 으로 바뀜.

---

## 5. Configuration

### `application.yml` (공통, 시크릿 0)

```yaml
file:
  upload-dir: ${FILE_UPLOAD_DIR:/tmp/duing/uploads}
  storage:
    provider: ${FILE_STORAGE_PROVIDER:local}     # local | s3

s3:
  endpoint: ${S3_ENDPOINT:}            # 업로드 API endpoint
  region: ${S3_REGION:auto}            # R2: auto (정석). 변경 금지.
  access-key: ${S3_ACCESS_KEY:}
  secret-key: ${S3_SECRET_KEY:}
  bucket: ${S3_BUCKET:duing}
  public-base-url: ${S3_PUBLIC_BASE_URL:}
```

### `application-local.yml` — 변경 없음 (matchIfMissing 으로 `local` 활성)

### `application-prod.yml`

```yaml
file:
  storage:
    provider: s3       # ★ 누락되면 silent local fallback (WARN 로그로 감지)

s3:
  endpoint: ${R2_ENDPOINT}
  region: auto
  access-key: ${R2_ACCESS_KEY}
  secret-key: ${R2_SECRET_KEY}
  bucket: ${R2_BUCKET:duing}
  public-base-url: https://files.duing.app
```

### `application-local-minio.yml` (신규)

```yaml
# 활성화: SPRING_PROFILES_ACTIVE=local,local-minio
# - local       → datasource, FILE_LOCAL_BASE_URL 제공
# - local-minio → file.storage.provider=s3, s3.* 오버라이드 (뒤가 우선)
# 이 파일에 spring.profiles.active 적지 말 것 (Spring Boot 2.4+ InvalidConfigDataPropertyException)

file:
  storage:
    provider: s3

s3:
  endpoint: http://localhost:9000
  region: us-east-1
  access-key: minioadmin
  secret-key: minioadmin
  bucket: duing
  public-base-url: http://localhost:9000/duing
```

### `src/test/resources/application.yml` 1줄 추가

```yaml
file:
  storage:
    provider: stub
```

→ `StubFileStorageService` 가 `@ConditionalOnProperty(havingValue="stub")` 으로 활성, `LocalFileStorageService` 는 property 존재로 matchIfMissing 미스매치 → 비활성. 빈 충돌 해소.

### 환경변수

| 변수 | 용도 | 주입 | 누락 시 |
|---|---|---|---|
| `R2_ENDPOINT` | R2 S3 endpoint | GitHub Secret → 배포 env | startup 실패 (`@NotBlank`) |
| `R2_ACCESS_KEY` | R2 API token | GitHub Secret | startup 실패 |
| `R2_SECRET_KEY` | R2 API token secret | GitHub Secret | startup 실패 |
| `R2_BUCKET` | bucket 명 (기본 `duing`) | 옵션 | 기본값 사용 |
| `FILE_UPLOAD_DIR` | 로컬 업로드 경로 | 옵션 | `/tmp/duing/uploads` |
| `FILE_LOCAL_BASE_URL` | 로컬 정적 서빙 base | 옵션 | `http://localhost:8080` |
| `FILE_STORAGE_PROVIDER` | 강제 provider 전환 (디버깅) | 옵션 | yml 기본값 |

`.env` 자동 로드는 `application.yml:5` 의 `spring.config.import: optional:file:.env[.properties]` 로 이미 활성. 포맷은 `KEY=VALUE` (.properties 호환).

### `backend/docker-compose.yml` (신규, MinIO 만)

> 이미지 태그는 `:latest` 금지 — `TestcontainersConfiguration` 의 `postgres:16-alpine` 핀 컨벤션 일관. 아래 예시의 `RELEASE.YYYY-MM-DDTHH-MM-SSZ` 는 구현 시점 최신 안정판으로 확정 후 박음.

```yaml
services:
  minio:
    image: minio/minio:RELEASE.YYYY-MM-DDTHH-MM-SSZ   # ★ 구현 시 안정판 확정
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes: [minio-data:/data]

  minio-setup:
    image: minio/mc:RELEASE.YYYY-MM-DDTHH-MM-SSZ      # ★ 구현 시 안정판 확정
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until (/usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin); do sleep 1; done;
      /usr/bin/mc mb --ignore-existing local/duing;
      /usr/bin/mc anonymous set download local/duing;
      exit 0;
      "

volumes:
  minio-data:
```

실행 가이드:
```
docker compose up -d minio minio-setup
# postgres 는 기존 방식대로 별도 (로컬 설치 or 별도 docker)
SPRING_PROFILES_ACTIVE=local,local-minio ./gradlew bootRun
```

---

## 6. Error Handling

### 매핑 표

| 발생 지점 | 트리거 | 처리 | 응답 |
|---|---|---|---|
| `FileController.validate` | size > 5MB | `FileException.UploadSizeExceededException` (기존) | **400** |
| `FileController.validate` | MIME 미지원/null | `FileException.UnsupportedFileTypeException` (기존) | **400** |
| `S3FileStorageService.upload` | `file == null \|\| isEmpty()` | `IllegalArgumentException` (기존 Local/Supabase 일치) | **500** (Local/Supabase 동일 wart, 개선은 Out of Scope) |
| `S3FileStorageService.upload` | `file.getBytes()` `IOException` | `IllegalStateException("파일을 읽지 못했습니다.", cause)` | **500** |
| `S3FileStorageService.upload` | `S3Exception` / `SdkClientException` | `IllegalStateException("S3 Storage 업로드에 실패했습니다.", cause)` + `log.error(bucket, key)` | **500** |
| `S3FileStorageService.delete` | prefix 불일치 | `log.warn("외부 storage URL 스킵 — prefix 불일치")` + return | 도메인 트랜잭션 정상 커밋 |
| `S3FileStorageService.delete` | `SdkException` | `log.warn("S3 Storage 삭제 실패: key={}", key, cause)` + return | 도메인 트랜잭션 정상 커밋, 객체 고아 |
| `S3FileStorageService` 빈 생성 | `@NotBlank` 위반 | `ConfigurationPropertiesBindException` (startup) | **startup 실패** (의도된 fail-fast) |

### 구현 골격 (단일 catch)

```java
@Override
public String upload(MultipartFile file, String directory) {
    if (file == null || file.isEmpty()) {
        throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
    }
    String key = directory + "/" + UUID.randomUUID() + extensionSuffix(file);
    byte[] body;
    try {
        body = file.getBytes();
    } catch (IOException ex) {
        throw new IllegalStateException("파일을 읽지 못했습니다.", ex);
    }
    try {
        s3Client.putObject(
            PutObjectRequest.builder()
                .bucket(props.bucket()).key(key)
                .contentType(resolveContentType(file.getContentType()))
                .build(),
            RequestBody.fromBytes(body));
    } catch (SdkException ex) {       // S3Exception + SdkClientException 통합
        log.error("S3 Storage 업로드 실패: bucket={}, key={}", props.bucket(), key, ex);
        throw new IllegalStateException("S3 Storage 업로드에 실패했습니다.", ex);
    }
    return props.publicBaseUrl() + "/" + key;
}
```

### 정책 근거

- 검증 vs 인프라 분리: 클라이언트가 고칠 수 있으면 4xx + 한글 메시지, 인프라 실패는 5xx + 일반 메시지
- upload 실패는 throw (도메인 트랜잭션 롤백 → URL 없는 엔티티 방지)
- delete 실패는 swallow (DB 정상 커밋 + 고아 객체는 cleanup job 흡수)
- `IllegalStateException` 으로 통일 (Supabase 구현체 패턴 일치)

### AWS SDK 기본 동작 활용 (직접 구현 X)

- 재시도: 기본 `RetryPolicy` 가 throttling/5xx 에 대해 3회 exponential backoff
- 타임아웃: `apiCallTimeout` 기본값. 5MB 업로드는 일반적으로 1초 내. 발생 시 `SdkClientException` → 위 매핑

---

## 7. Testing

### `StubFileStorageService` 충돌 해소 (선결)

- `@Profile("test")` 제거 → `@ConditionalOnProperty(name="file.storage.provider", havingValue="stub")`
- `src/test/resources/application.yml` 에 `file.storage.provider: stub` 1줄 추가
- javadoc 갱신: `"property=stub 으로 활성화"`

### L1. 단위 — `S3FileStorageServiceTest`

도구: JUnit 5 + Mockito (`S3Client` mock), `MockMultipartFile`

핵심 케이스 (`@DisplayName` 컨벤션):
- `"directory + UUID 파일명으로 키가 생성되어 PutObject 가 호출된다"` (`ArgumentCaptor<PutObjectRequest>`)
- `"업로드 시 객체의 Content-Type 이 MultipartFile 의 contentType 으로 저장된다"`
- `"Content-Type 이 null 이면 application/octet-stream 으로 폴백된다"`
- `"업로드 성공 시 publicBaseUrl + / + key 형태의 URL 이 반환된다"`
- `"publicBaseUrl 끝에 슬래시가 있어도 업로드 반환 URL 의 슬래시는 1개로 유지된다"` (★ trailing slash 회귀)
- `"S3 가 SdkException 을 던지면 IllegalStateException 으로 래핑된다"` (`S3Exception`, `SdkClientException` 양쪽)
- `"파일이 비어 있으면 IllegalArgumentException 이 발생하고 S3 호출이 일어나지 않는다"`
- `"publicBaseUrl 과 prefix 가 일치하지 않는 URL 은 삭제 호출 없이 무시된다"`
- `"publicBaseUrl 끝에 슬래시가 있어도 delete 의 prefix 매칭은 정확히 일치한다"` (★ trailing slash 회귀)
- `"공개 URL 에서 key 가 leading slash 없이 추출되어 DeleteObject 가 호출된다"` (★ 핵심 회귀)
- `"삭제 중 SdkException 이 발생해도 예외가 전파되지 않고 warn 로그만 남는다"`

### L2. 통합 — `S3FileStorageIntegrationTest` (MinIO TestContainer)

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Import(TestcontainersConfiguration.class)        // ★ 다른 통합테스트와 동일, datasource/flyway 부팅
@Testcontainers
class S3FileStorageIntegrationTest extends IntegrationTestBase {

@Container
static MinIOContainer minio =                     // ★ :latest 금지, 구현 시 안정판 확정
    new MinIOContainer("minio/minio:RELEASE.YYYY-MM-DDTHH-MM-SSZ")
        .withUserName("minioadmin").withPassword("minioadmin");

@DynamicPropertySource
static void overrideProps(DynamicPropertyRegistry registry) {
    registry.add("file.storage.provider", () -> "s3");
    registry.add("s3.endpoint", minio::getS3URL);
    registry.add("s3.region", () -> "us-east-1");
    registry.add("s3.access-key", () -> "minioadmin");
    registry.add("s3.secret-key", () -> "minioadmin");
    registry.add("s3.bucket", () -> "duing-test");
    registry.add("s3.public-base-url", () -> minio.getS3URL() + "/duing-test");
}

@BeforeAll
static void createBucket() { /* SDK 로 CreateBucket */ }
```

**왜 L2 가 성립하는가 (디커플링 근거):** Spring property source 우선순위는 `@DynamicPropertySource > application.yml`. test/application.yml 의 `provider=stub` 을 `@DynamicPropertySource` 가 `provider=s3` 로 덮어쓰고, Stub 이 이제 property 게이트이므로 test 프로파일이 켜져 있어도 Stub 비활성, S3 만 활성. **test 프로파일 + 실제 S3 구현체가 한 컨텍스트에서 공존**.

케이스:
- `"실제 MinIO 에 업로드 후 객체 메타데이터의 Content-Type 이 image/webp 로 저장된다"` (`HeadObjectResponse`)
- `"동일 directory 에 두 번 업로드해도 UUID 가 다르므로 충돌하지 않는다"`
- `"업로드 후 반환된 URL 에서 prefix 를 제거하면 실제 객체 key 와 일치한다"`
- `"업로드한 객체를 delete 호출 후 HeadObject 가 NoSuchKeyException 을 던진다"`
- `"DB 에 박힌 다른 호스트 URL 을 delete 에 넘겨도 MinIO 에 영향을 주지 않는다"`

### L3. 설정 바인딩 — `StorageBeanActivationTest`

도구: `ApplicationContextRunner` (application.yml 안 읽음, 깨끗한 시작)

```java
private final ApplicationContextRunner runner = new ApplicationContextRunner()
    .withUserConfiguration(
        S3ClientConfig.class,
        LocalFileStorageService.class,
        S3FileStorageService.class,      // ★ 누락 시 doesNotHaveBean 거짓 양성
        StubFileStorageService.class
    );
```

케이스:
- `"file.storage.provider 미설정 시 LocalFileStorageService 가 활성된다"` (matchIfMissing 회귀)
  ```java
  @TempDir Path tempDir;
  // ApplicationContextRunner 는 application.yml 안 읽음 → file.upload-dir placeholder 가
  // 해석 안 돼 엉뚱한 이유로 컨텍스트 실패. 명시 주입 필수.
  runner.withPropertyValues("file.upload-dir=" + tempDir).run(ctx -> ...);
  ```
- `"file.storage.provider=s3 일 때 S3FileStorageService 만 활성되고 다른 구현체는 비활성된다"` (mutually exclusive)
- `"file.storage.provider=s3 인데 s3.access-key 가 비어 있으면 컨텍스트 부팅이 실패한다"` (★ **`@Validated + @NotBlank` 회귀** — 이 PR 의 안전 서사 게이트)
- `"file.storage.provider=s3 인데 s3.public-base-url 이 비어 있으면 부팅 실패한다"` (필드별 parameterized)

→ 이 클래스가 **silent fallback 근절 약속의 자동 회귀 게이트**. `@Validated` 제거되거나 `@ConfigurationPropertiesScan` 전역화되면 깨짐.

### L4. 회귀 — 기존 `FileApiTest` 외

- Stub 활성 조건 변경만 반영, 본문 수정 없음
- 통과 = 기존 API 흐름 무회귀

### 범위 외 (테스트)

- 실제 R2 호출 (credential·격리 문제)
- MinIO anonymous policy 자체 검증 (MinIO 동작 보증)
- 부하/내구성
- 마이그레이션 (후속 PR)

### CI 영향

- 기존 `backend-ci.yml` 이 TestContainers postgres 사용 중 → MinIO 컨테이너도 동일 메커니즘
- **CI 에 R2 credential 추가 불필요**
- 추가 시간: MinIO 컨테이너 ~3초 (L2 만 영향)

### 사소 인지

- L3 `ApplicationContextRunner` 는 application.yml 안 읽음 → base yml `provider=stub` 영향 없음
- test multipart 한도 6MB (main 10MB) — 5MB 정책 경계 테스트 영향 없음

---

## 8. Deployment & Rollback

### 8.1 배포 시퀀스 (의존)

```
[1] 인프라 사전 작업 (Cloudflare R2)  ┐
                                       ├─ [3] 머지 전 완료 필수
[2] GitHub Actions Secret 등록        ┘
       │
       ▼
[3] PR → CI → 리뷰 → develop 머지
       │
       ▼
[4] develop → 운영 배포 (기존 파이프라인)
       │
       ▼
[5] 머지 후 스모크 (운영자 1회 수동)
       │
       ▼
[6] (안정 확인 후) Supabase Storage 리소스 정리 — 별도 작업
```

`@Validated + @NotBlank` fail-fast 가 안전망 — env 누락 시 컨테이너 부팅 실패 = 이전 이미지 유지.

### 8.2 인프라 사전 체크리스트 (운영자 확인, 머지 게이트)

| # | 작업 | 확인 방법 |
|---|---|---|
| 1 | R2 bucket `duing` 생성, **Location = APAC** | R2 dashboard 의 bucket 목록 |
| 2 | `files.duing.app` Custom Domain 바인딩 + DNS 활성 (status: Active) | `dig files.duing.app` / bucket Settings → Custom Domains |
| 3 | Public access 활성 (custom domain 연결 시 자동, 확인) | bucket Settings → Public Access |
| 4 | S3 API Token 발급 (Object R/W, bucket 스코프 `duing`) | token 발급 화면에서 endpoint/access-key/secret-key 3개 |
| 5 | GitHub Secret 3개: `R2_ENDPOINT`, `R2_ACCESS_KEY`, `R2_SECRET_KEY` | repo Settings → Secrets and variables → Actions |

> **`region` 은 SDK 서명용 `auto`. 데이터 위치는 bucket Location = APAC 으로 분리.** 둘은 다른 개념.

### 8.3 머지 후 스모크 (운영자 1회, ~3분)

```
[A] 컨테이너 startup 로그
    → "Active storage backend = S3 (endpoint=..., bucket=duing)" 가 INFO
    → "Active storage backend = LOCAL" 이 WARN 으로 찍히면 즉시 롤백

[B] 인증 토큰 발급 후 업로드
    POST https://api.duing.app/api/v1/files
      Authorization: Bearer <token>
      multipart/form-data: file=<5MB 이하 jpg/png/webp>, purpose=COVER
    → 201 + { storageKey: "https://files.duing.app/club/cover/{uuid}.webp",
              url:        "https://files.duing.app/club/cover/{uuid}.webp" }

[C] 반환 URL 을 브라우저로 GET
    → 200 + Content-Type: image/webp
    → 403/404 면 인프라 체크리스트 #2/#3 미완

[D] R2 dashboard 에서 club/cover/{uuid}.webp 객체 존재 + Content-Type 확인
```

### 8.4 롤백 시나리오

| 시나리오 | 롤백 방법 | 데이터 영향 |
|---|---|---|
| startup 실패 (yml/Secret 누락) | 이전 이미지 유지 (자동). yml/Secret 보정 후 재배포 | 없음 |
| 업로드는 OK, `<img>` 403/404 | **코드 롤백 X**. 인프라 체크리스트 #2/#3 보정 | 없음 (객체 살아있음) |
| 일부 업로드 실패 + S3 unhealthy | **R2 복구가 절대 우선.** ⚠️ **응급 조치 — 기능하는 폴백 아님.** R2 복구 완료까지의 임시 생존 모드로만 `FILE_STORAGE_PROVIDER=local` env 강제 → 재시작. 이 상태에서는: ① `file.local.base-url` 이 prod yml 에 없어 반환 URL 이 상대경로(`/files/...`) → 클라이언트 렌더링 깨짐, ② 컨테이너 재시작 시 `/tmp` 휘발로 업로드된 파일 소실, ③ 신규 업로드는 사실상 불능 = **읽기 전용에 가깝게 운영**. 운영자가 이 폴백을 "수 시간/하루 버틸 만한 대안" 으로 신뢰하면 안 됨. R2 복구가 지연되면 사용자 공지 + 업로드 기능 일시 비활성을 검토 | 폴백 기간 업로드 = 휘발 + 렌더링 깨짐. R2 복구 후 즉시 `s3` 환원 |
| 의도치 않은 회귀 발견 | `git revert` + 재배포. R2 객체는 그대로 둠 (DB 의 R2 URL 은 custom domain 살아있어 여전히 GET 가능) | DB 의 R2 URL 그대로 유효, 신규 업로드만 `/tmp` 로 |
| 비용/quota 초과 | R2 콘솔에서 알람/제한. 코드 변경 없음 | 없음 |

**롤백 시 만지면 안 되는 것:**
- R2 bucket 의 객체 — 삭제 금지 (DB URL 들이 끊김)
- `files.duing.app` custom domain 바인딩 — 끊으면 모든 이미지 즉시 끊김

### 8.5 완료 기준 (Acceptance Criteria)

- [ ] `file.storage.provider=s3` + R2 endpoint 로 prod 컨테이너 startup 성공
- [ ] startup 로그에 `Active storage backend = S3 (...)` INFO 1줄, WARN(LOCAL) 0줄
- [ ] `local` 프로파일은 그대로 `/tmp` 동작 (개발자 환경 무회귀)
- [ ] `SPRING_PROFILES_ACTIVE=local,local-minio` 로 MinIO 통해 동일 S3 코드 경로 동작
- [ ] DB 에는 full URL 저장 (인터페이스 시그니처 불변)
- [ ] prod 가 `/tmp` 로 빠지지 않음 (`provider: s3` 명시 + WARN 게이트)
- [ ] `SupabaseStorageFileStorageService` + `supabase:` yml + 관련 의존성 완전 제거, 빌드 통과
- [ ] 신규/기존 테스트 전부 통과 (L1~L4)
- [ ] 스모크 [A]~[D] 통과 (운영자 확인)
- [ ] PR 본문에 인프라 체크리스트 + 스모크 결과 첨부

### 8.6 PR 본문 골격

```
🚀 작업 내용
  Cloudflare R2 를 운영 파일 스토리지로 도입했습니다. 기존 FileStorageService
  추상화 위에 S3 호환 구현체 하나만 추가해 R2/MinIO/(향후) AWS S3 를 endpoint
  설정으로 전환할 수 있게 했고, 운영 프로파일이 silently /tmp 로 빠지던 버그도
  같이 해결했습니다. 사용하지 않던 Supabase Storage 구현체와 설정은 함께
  제거했습니다.

🤔 고민했던 내용
  - R2 와 AWS S3 가 같은 API 라 구현체를 분리할지 통합할지 → 통합, 어떤 백엔드로
    가는지는 yml endpoint 가 결정.
  - presigned URL 도입 여부 → 5MB 이미지뿐인 현 워크로드에 YAGNI, 동영상 도입 시점.
  - matchIfMissing=true 가 prod /tmp 버그 원인이라 fail-fast 안전장치를 어떻게
    짤지 → provider 누락 시 WARN + @Validated @NotBlank 이중 게이트.

💬 리뷰 중점사항
  머지 전 운영자 확인 (인프라 체크리스트):
    1) R2 bucket 'duing' 생성 (Location: APAC)
    2) files.duing.app Custom Domain 바인딩 + 활성
    3) Public access 활성
    4) S3 API Token 발급 (R/W, bucket 스코프)
    5) GitHub Secret: R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY

  머지 후 스모크:
    - startup 로그 "Active storage backend = S3" 확인
    - /api/v1/files 업로드 → 반환 URL 브라우저 GET 200 확인
```
