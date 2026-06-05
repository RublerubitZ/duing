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

    @Test
    @DisplayName("Content-Type 이 누락된 multipart 파트는 400 으로 거부된다")
    void rejectsMissingContentType() {
        // 비정상 API 호출 (curl / 외부 클라이언트) 방어. RestAssured 의 multiPart 오버로드는
        // contentType 인자 없이 호출하면 서버에 application/octet-stream 또는 빈 값으로 전달된다.
        // 둘 다 ALLOWED_MIME_TYPES 에 포함되지 않으므로 400 이 정상 응답.
        RestAssured
                .given()
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .multiPart("file", "no-content-type", bytesOfSize(1024))
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

Expected: `uploadsValidJpeg` / `uploadsAtMaxBoundary` 만 통과, 나머지 5개 케이스 실패 (`Expected 400 but was 201` — 아직 검증 미구현). 정상 케이스 2개가 통과하지 않으면 토큰/엔드포인트/StubFileStorageService 설정 문제이므로 진행 중단.

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
- Modify (조건부): `backend/src/main/resources/application.yml` 또는 `application-test.yml`

이 태스크는 **기존 `FileController.java` 의 시그니처·어노테이션·Swagger 설정·`FileApi` 구현 관계를 절대 건드리지 않는다.** `upload()` 진입부에 한 줄 추가 + private `validate()` 메서드 추가 + 두 개 import 추가, 이게 전부.

- [ ] **Step 1: 사전 점검 — Spring multipart 제한 확인**

`5MB + 1 byte` 테스트가 우리 검증이 아닌 Spring multipart 레이어에서 먼저 차단되면 응답 상태가 400 이 아니라 413 (또는 500 + `MaxUploadSizeExceededException`) 으로 떨어진다. 우리 검증이 먼저 동작하려면 Spring 제한이 정책(5MB) 보다 커야 한다.

먼저 현재 설정 확인:

```bash
grep -rn "multipart" backend/src/main/resources/
```

결과가 비어있거나 `max-file-size` 가 정의되어 있지 않으면 Spring Boot 기본값 (`1MB`) 이 적용된다 — 우리 정책(5MB) 보다 작으므로 **반드시 설정 추가 필요**. 이미 6MB 이상으로 잡혀 있으면 Step 2 로 진행.

`backend/src/main/resources/application.yml` 에 다음 블록 추가 (기존 `spring:` 키가 있으면 그 아래로 합칠 것 — 새 `spring:` 루트 키를 만들지 말 것):

```yaml
spring:
  servlet:
    multipart:
      max-file-size: 6MB
      max-request-size: 6MB
```

**의도:** 앱 정책(5MB) 보다 Spring 제한(6MB) 을 1MB 크게 잡아 5MB + 1 byte 시나리오에서 우리 검증이 먼저 동작하도록 한다. Spring 의 413 응답은 한국어 메시지 커스터마이즈가 까다로워 사용자 친화적이지 않은 반면, 우리 `FileException` 은 명확한 한국어 메시지를 제공한다.

- [ ] **Step 2: FileController 에 최소 변경 — validate 호출 + private 메서드 추가**

기존 `FileController.java` 를 읽은 뒤 다음 3개 변경만 적용한다. **클래스 어노테이션, `implements FileApi`, `upload()` 의 `@Override` / `@PostMapping(consumes = ...)` / `@PreAuthorize` / `@RequestPart` / `@RequestParam` 시그니처는 그대로 둔다.**

**변경 1 — import 두 줄 추가** (기존 `com.duing.global.file.controller.dto.FilePurpose` import 라인 근처):

```java
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.exception.FileException;
```

**변경 2 — `upload()` 메서드 본문 첫 줄에 `validate(file);` 한 줄 추가**:

```java
public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
        @RequestPart("file") MultipartFile file,
        @RequestParam("purpose") FilePurpose purpose) {
    validate(file);                                    // ← 추가되는 단 한 줄
    String uploadedUrl = fileStorageService.upload(file, purpose.directory());
    FileUploadResponse fileUploadResponse = new FileUploadResponse(uploadedUrl, uploadedUrl);
    return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(fileUploadResponse));
}
```

**변경 3 — 클래스 내부(어디든 무방, 권장: `upload()` 메서드 바로 아래) 에 private 메서드 추가**:

```java
private void validate(MultipartFile file) {
    if (file.getSize() > FileUploadPolicy.MAX_BYTES) {
        throw new FileException.UploadSizeExceededException();
    }
    String contentType = file.getContentType();
    if (contentType == null || !FileUploadPolicy.ALLOWED_MIME_TYPES.contains(contentType)) {
        throw new FileException.UnsupportedFileTypeException();
    }
}
```

이 외 어떤 라인도 수정/삭제하지 않는다.

- [ ] **Step 3: 테스트 실행 — 통과 확인**

```bash
cd backend && ./gradlew test --tests "com.duing.domain.file.FileApiTest"
```

Expected: 7/7 PASS.

증상 → 원인 가이드:

- `5MB + 1 byte` 케이스가 400 이 아닌 413/500 → Step 1 의 multipart 설정 누락. yml 추가 후 재실행.
- `rejectsMissingContentType` 가 400 이 아닌 201 → RestAssured 가 헤더 없이도 octet-stream 으로 보정해 검증을 통과시킨 경우. `bytesOfSize(1024)` 의 `contentType` 인자를 `""` (빈 문자열) 로 명시. 그래도 통과되면 백엔드 validate 의 null/empty 처리가 누락된 것이므로 `if (contentType == null || contentType.isBlank() || !ALLOWED_MIME_TYPES.contains(contentType))` 로 강화.
- 정상 케이스 2개가 실패로 떨어짐 → FileApi 인터페이스 또는 Swagger 설정 변경을 실수로 동반했을 가능성. `git diff backend/src/main/java/com/duing/global/file/controller/FileController.java` 로 확인 — Step 2 의 변경 1/2/3 이 외 라인이 있으면 되돌릴 것.

- [ ] **Step 4: 전체 백엔드 테스트 실행 — 회귀 없음 확인**

```bash
cd backend && ./gradlew test
```

Expected: 전체 PASS. 기존 파일 업로드 테스트가 없으므로 회귀 영향 없음. 다른 도메인 인수 테스트가 multipart 를 사용한다면 (없을 것으로 보이나 확인) 영향 점검.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/main/java/com/duing/global/file/controller/FileController.java
# Step 1 에서 yml 추가했다면 함께 stage
git add backend/src/main/resources/application.yml 2>/dev/null || true
git commit -m "feat(backend): 파일 업로드 형식·용량 검증 (5MB / JPG·PNG·WEBP)"
```

---

## Risks & 검토 항목

- **Spring multipart vs 앱 검증 우선순위:** Spring `max-file-size` 가 정책(5MB) 보다 작으면 우리 검증이 절대 실행되지 않는다. Task 4 Step 1 의 사전 점검 필수.
- **Content-Type 위조:** §spec 4.3 명시대로 이번 PR 의 검증은 클라이언트가 보낸 헤더에 의존한다. Magic Number 검증은 별도 PR (spec Out of Scope).
- **빈 파일 (size=0):** `file.getSize() > MAX_BYTES` 검증은 통과하지만 의미 없는 빈 파일이 Storage 에 올라간다. 이번 PR 의 명시 정책에 빈 파일 차단이 없으므로 작업 범위 밖. 필요 시 후속.
- **multipart 설정 추가가 다른 도메인 영향을 주는가:** `max-file-size: 6MB` 는 기존 1MB 기본값보다 큼 — 다른 업로드 (예: ClubPhoto) 가 이미 1MB 초과 파일을 받고 있었다면 본 변경으로 새로 통과되는 케이스가 생긴다. ClubPhoto Controller 가 별도 size 검증을 가졌는지 grep 으로 확인 필요.

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

- **Spec 커버리지:** §5.1 (FileUploadPolicy) = Task 1, §5.2 (validate 메서드) = Task 4, §5.3 (FileException) = Task 2, §5.4 (인수 테스트 7 케이스 — spec 의 6 케이스 + Content-Type null 보강) = Task 3. 누락 없음.
- **플레이스홀더:** 없음.
- **타입 일관성:** `FileException.UploadSizeExceededException` / `UnsupportedFileTypeException` 가 Task 2/4 에서 동일.
- **회귀 위험:** 정상 케이스 인수 테스트가 먼저 통과하는지 Task 3 Step 2 에서 검증.
