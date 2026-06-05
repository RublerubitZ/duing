# 이미지 업로드 통합 리팩토링 — Backend (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/v1/files` 진입 시점에 파일 형식(JPG/PNG/WEBP)과 용량(≤5MB) 을 검증하고, 위반 시 한국어 400 응답을 반환한다.

**Architecture:** `FileController` 가 단일 진입점이므로 별도 Validator 클래스 분리 없이 private 메서드로 검증한다. 정책 상수는 `FileUploadPolicy` 클래스로 추출해 인수 테스트가 동일 상수를 참조하도록 한다. 예외는 기존 `ApplicationException` 패턴(`message + HttpStatus` 직접 전달, ErrorCode enum 없음)을 따른다.

**Tech Stack:** Spring Boot 3.4, Java 21, RestAssured + JUnit 5 + TestContainers.

**Spec Reference:** `docs/superpowers/specs/2026-06-05-image-upload-consolidation-design.md` §5, §7

---

## File Structure

**Create:**
- `backend/src/main/java/com/duing/global/file/FileUploadPolicy.java` — 정책 상수 (MAX_BYTES, ALLOWED_MIME_TYPES)
- `backend/src/main/java/com/duing/global/file/exception/FileException.java` — `ApplicationException` 상속, 두 개의 inner class 예외
- `backend/src/test/java/com/duing/domain/file/FileApiTest.java` — RestAssured 인수 테스트

**Modify:**
- `backend/src/main/java/com/duing/global/file/controller/FileController.java` — `validate(MultipartFile)` private 메서드 추가, upload 진입 시 호출

---

## Task 1: 정책 상수 클래스 추가

**Files:**
- Create: `backend/src/main/java/com/duing/global/file/FileUploadPolicy.java`

- [ ] **Step 1: 정책 상수 클래스 작성**

`backend/src/main/java/com/duing/global/file/FileUploadPolicy.java`:

```java
package com.duing.global.file;

import java.util.Set;

public final class FileUploadPolicy {

    public static final long MAX_BYTES = 5L * 1024 * 1024;

    public static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp"
    );

    private FileUploadPolicy() {
    }
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/FileUploadPolicy.java
git commit -m "feat(backend): 파일 업로드 정책 상수 (MAX_BYTES, ALLOWED_MIME_TYPES)"
```

---

## Task 2: FileException 정의

**Files:**
- Create: `backend/src/main/java/com/duing/global/file/exception/FileException.java`

- [ ] **Step 1: 예외 클래스 작성**

기존 `NoticeException` 패턴 (`backend/src/main/java/com/duing/domain/notice/exception/NoticeException.java`) 을 그대로 따른다. `ApplicationException(String message, HttpStatus status)` 생성자 사용.

`backend/src/main/java/com/duing/global/file/exception/FileException.java`:

```java
package com.duing.global.file.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FileException extends ApplicationException {

    protected FileException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class UploadSizeExceededException extends FileException {
        private static final String MESSAGE = "이미지 크기는 5MB 이하여야 합니다.";
        public UploadSizeExceededException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class UnsupportedFileTypeException extends FileException {
        private static final String MESSAGE = "지원하지 않는 이미지 형식입니다. (JPG, PNG, WEBP만 가능)";
        public UnsupportedFileTypeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd backend && ./gradlew compileJava
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/exception/FileException.java
git commit -m "feat(backend): FileException (UploadSizeExceeded / UnsupportedFileType)"
```

---

## Task 3: FileApiTest 작성 (RED — 검증 미구현 상태에서 실패)

**Files:**
- Create: `backend/src/test/java/com/duing/domain/file/FileApiTest.java`

- [ ] **Step 1: 인수 테스트 작성**

`StubFileStorageService` (test profile no-op) 가 `backend/src/test/java/com/duing/common/StubFileStorageService.java` 에 이미 존재하므로 별도 mock 없이 동작. 토큰은 `jwtTokenProvider.createToken(userId, role)` 으로 인라인 생성 (`ClubPhotoControllerTest` 참고).

`backend/src/test/java/com/duing/domain/file/FileApiTest.java`:

```java
package com.duing.domain.file;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.auth.JwtTokenProvider;
import com.duing.global.file.FileUploadPolicy;
import io.restassured.RestAssured;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class FileApiTest {

    @LocalServerPort int port;

    @Autowired UserRepository userRepository;
    @Autowired JwtTokenProvider jwtTokenProvider;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    private String token;

    @BeforeEach
    void setUp() {
        RestAssured.port = port;
        long unique = sequence.incrementAndGet();
        User user = User.builder()
                .email("file-test-" + unique + "@duing.test")
                .password("encoded")
                .name("파일테스터")
                .nickname("nick-" + unique)
                .studentId("S" + unique)
                .role(UserRole.STUDENT)
                .college(College.SOFTWARE)
                .grade(Grade.G3)
                .build();
        userRepository.save(user);
        token = jwtTokenProvider.createToken(user.getId(), user.getRole().name());
    }

    private byte[] bytesOfSize(int size) {
        return new byte[size];
    }

    @Test
    @DisplayName("정상 JPG 가 5MB 미만이면 201 과 URL 을 반환한다")
    void uploadsValidJpeg() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.jpg", bytesOfSize(1024), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value())
                    .body("data.url", org.hamcrest.Matchers.notNullValue());
    }

    @Test
    @DisplayName("정확히 5MB 인 JPG 는 통과한다")
    void uploadsAtMaxBoundary() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "max.jpg", bytesOfSize((int) FileUploadPolicy.MAX_BYTES), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.CREATED.value());
    }

    @Test
    @DisplayName("5MB + 1 byte 를 넘으면 400 과 한국어 메시지를 반환한다")
    void rejectsOversizedFile() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "oversize.jpg", bytesOfSize((int) FileUploadPolicy.MAX_BYTES + 1), "image/jpeg")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("5MB"));
    }

    @Test
    @DisplayName("image/gif 는 400 으로 거부된다")
    void rejectsGif() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.gif", bytesOfSize(1024), "image/gif")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value())
                    .body("message", org.hamcrest.Matchers.containsString("지원하지 않는"));
    }

    @Test
    @DisplayName("image/bmp 는 400 으로 거부된다")
    void rejectsBmp() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "sample.bmp", bytesOfSize(1024), "image/bmp")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("Content-Type 헤더가 application/octet-stream 이면 400 으로 거부된다")
    void rejectsUnknownContentType() {
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "blob", bytesOfSize(1024), "application/octet-stream")
                    .queryParam("purpose", "NOTICE_COVER")
                .when()
                    .post("/api/v1/files")
                .then()
                    .statusCode(HttpStatus.BAD_REQUEST.value());
    }
}
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"
```

Expected: `uploadsValidJpeg` / `uploadsAtMaxBoundary` 만 통과, 나머지 4개 케이스 실패 (`Expected 400 but was 201` — 아직 검증 미구현). 정상 케이스 2개가 통과하지 않으면 토큰/엔드포인트/StubFileStorageService 설정 문제이므로 진행 중단.

`uploadsAtMaxBoundary` 의 byte 배열 5MB 가 메모리에서 문제가 되면 `bytesOfSize` 를 `new byte[size]` 그대로 두되 JVM heap 옵션을 확인. Gradle 기본 (`-Xmx`) 으로 충분.

- [ ] **Step 3: 커밋 (실패하는 테스트)**

```bash
git add backend/src/test/java/com/duing/domain/file/FileApiTest.java
git commit -m "test(backend): FileApiTest — 형식·용량 검증 인수 테스트 (RED)"
```

---

## Task 4: FileController 검증 구현 (GREEN)

**Files:**
- Modify: `backend/src/main/java/com/duing/global/file/controller/FileController.java`

- [ ] **Step 1: validate 메서드 + import 추가**

기존 `FileController.java` 전체를 다음으로 교체:

```java
package com.duing.global.file.controller;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.controller.dto.FileUploadResponse;
import com.duing.global.file.exception.FileException;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController implements FileApi {

    private final FileStorageService fileStorageService;

    @Override
    @PostMapping(consumes = "multipart/form-data")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @RequestPart("file") MultipartFile file,
            @RequestParam("purpose") FilePurpose purpose) {
        validate(file);
        String uploadedUrl = fileStorageService.upload(file, purpose.directory());
        FileUploadResponse fileUploadResponse = new FileUploadResponse(uploadedUrl, uploadedUrl);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(fileUploadResponse));
    }

    private void validate(MultipartFile file) {
        if (file.getSize() > FileUploadPolicy.MAX_BYTES) {
            throw new FileException.UploadSizeExceededException();
        }
        String contentType = file.getContentType();
        if (contentType == null || !FileUploadPolicy.ALLOWED_MIME_TYPES.contains(contentType)) {
            throw new FileException.UnsupportedFileTypeException();
        }
    }
}
```

- [ ] **Step 2: 테스트 실행 — 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"
```

Expected: 6/6 PASS.

만약 `5MB + 1 byte` 케이스가 fail 하면 Spring multipart 설정 (`spring.servlet.multipart.max-file-size` 기본 1MB) 이 사전에 차단했을 가능성. 그 경우 `backend/src/main/resources/application.yml` (또는 `application-test.yml`) 에 다음 추가:

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 6MB
      max-request-size: 6MB
```

(앱 자체 정책 5MB 보다 크게 잡아 우리 검증이 먼저 동작하도록.)

- [ ] **Step 3: 전체 백엔드 테스트 실행 — 회귀 없음 확인**

```bash
cd backend && ./gradlew test
```

Expected: 전체 PASS. 기존 파일 업로드 테스트가 없으므로 회귀 영향 없음.

- [ ] **Step 4: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/controller/FileController.java
git commit -m "feat(backend): 파일 업로드 형식·용량 검증 (5MB / JPG·PNG·WEBP)"
```

만약 Step 2 에서 multipart 설정 변경이 필요했다면 같은 커밋에 yml 도 포함.

---

## Task 5: PR 생성

**Files:** (수정 없음)

- [ ] **Step 1: 브랜치 push**

```bash
git push -u origin feat/image-upload-backend-validation
```

(브랜치명은 작업 시작 시 `develop` 에서 분기한 그대로 사용. 미생성 상태라면 `git checkout -b feat/image-upload-backend-validation develop` 후 push.)

- [ ] **Step 2: PR 생성**

```bash
gh pr create --base develop --title "feat(backend): 파일 업로드 형식·용량 검증" --body "$(cat <<'EOF'
## 🚀 작업 내용

`POST /api/v1/files` 진입 시점에 형식(JPG/PNG/WEBP) 과 용량(≤5MB) 을 검증한다. 정상 사용자의 실수와 캐주얼한 우회 시도를 차단하고, 위반 시 한국어 400 메시지를 반환해 프론트가 그대로 노출할 수 있게 했다.

정책 상수는 `FileUploadPolicy` 클래스로 추출해 인수 테스트가 동일 상수를 참조한다 (경계 케이스 자동 동기화).

## 🤔 고민했던 내용

`Content-Type` 헤더 기반 검증은 클라이언트가 위조 가능하므로 이번 PR 의 보호 수준은 "정상 사용자 실수 + 캐주얼 우회" 까지로 한정했다. Magic Number / Apache Tika 등 시그니처 검증은 별도 PR (spec Out of Scope §7) 로 미뤘다.

Validator 별도 클래스 분리도 검토했으나 진입점이 단일 컨트롤러이고 로직이 두 줄짜리이므로 private 메서드로 유지 (YAGNI).

## 💬 리뷰 중점사항

- 정책 상수 (5MB / image/jpeg, png, webp) 가 적절한지
- 예외 메시지 한국어 표현이 사용자에게 친절한지
- Spring multipart `max-file-size` 설정이 우리 검증 (5MB) 보다 작지 않은지

## Spec / Out of Scope

- 설계: \`docs/superpowers/specs/2026-06-05-image-upload-consolidation-design.md\`
- 후속: PR2 (프론트 통합 + ImageWithFallback)
EOF
)"
```

- [ ] **Step 3: CI 통과 확인**

`backend-ci.yml` 의 lint / test / build 가 모두 PASS 인지 확인.

---

## Self-Review

- **Spec 커버리지:** §5.1 (FileUploadPolicy) = Task 1, §5.2 (validate 메서드) = Task 4, §5.3 (FileException) = Task 2, §5.4 (인수 테스트 6 케이스) = Task 3. 누락 없음.
- **플레이스홀더:** 없음.
- **타입 일관성:** `FileException.UploadSizeExceededException` / `UnsupportedFileTypeException` 가 Task 2/4 에서 동일.
- **회귀 위험:** 정상 케이스 인수 테스트가 먼저 통과하는지 Task 3 Step 2 에서 검증.
