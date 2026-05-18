# 회원가입 확장 · 로그인 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원가입 시 학년 · 단과대학 · 전공 · 전화번호 · 약관 동의를 추가로 수집하고, 회원가입 폼을 2단계 위저드로 정돈하며 로그인 페이지를 같은 카드 레이아웃으로 리디자인한다.

**Architecture:**
- 백엔드: `users` 테이블에 5개 컬럼 직접 추가 (Flyway V19), `Grade`/`College` enum 신규, `SignupRequest`·`SignupCommand`·`User.create()` 시그니처 확장, `UserException.PhoneAlreadyExistsException` 추가.
- 프론트: `(auth)/signup` 한 페이지를 `useReducer` 기반 2-step 위저드로 전환. `(auth)/layout.tsx` 공용 카드 컨테이너 신규. `packages/schemas`·`packages/types` 미러링 갱신.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / Bean Validation / JPA · Next.js 15 / React 19 / Zod / TanStack Query · 모노레포(pnpm) · 한국어 메시지

**Spec:** `docs/superpowers/specs/2026-05-18-auth-signup-redesign-design.md`

**Branch 분할 (PR 단위):**
- PR 1: `feat/xx-user-profile-fields` (backend) — Task 1~8
- PR 2: `feat/xx-signup-wizard` (frontend) — Task 9~14 (PR1 머지 후)
- PR 3: `feat/xx-login-redesign` (frontend) — Task 15~17 (PR2 머지 후)

---

## File Structure

### 백엔드 (PR 1)

**Create:**
- `backend/src/main/resources/db/migration/V19__add_user_profile_columns.sql`
- `backend/src/main/java/com/duing/domain/user/entity/Grade.java`
- `backend/src/main/java/com/duing/domain/user/entity/College.java`
- `backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java`

**Modify:**
- `backend/src/main/java/com/duing/domain/user/entity/User.java` — 컬럼 5개 + `create()` 시그니처
- `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java` — `existsByPhone`
- `backend/src/main/java/com/duing/domain/user/exception/UserException.java` — `PhoneAlreadyExistsException`
- `backend/src/main/java/com/duing/domain/user/service/dto/command/SignupCommand.java` — 필드 확장
- `backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java` — 필드 확장 + `@Pattern`/`@AssertTrue`
- `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java` — 중복 phone 체크 + `User.create()` 인자
- `backend/src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java` — 새 시그니처 따라가는 helper 보정

### 프론트엔드 (PR 2)

**Create:**
- `frontend/packages/schemas/src/password.ts` — PW 강도 단일 정의
- `frontend/apps/web/app/(auth)/signup/_components/SignupStepAccount.tsx`
- `frontend/apps/web/app/(auth)/signup/_components/SignupStepProfile.tsx`
- `frontend/apps/web/app/(auth)/signup/_components/CollegeSelect.tsx`
- `frontend/apps/web/app/(auth)/signup/_components/GradeSelect.tsx`
- `frontend/apps/web/app/(auth)/signup/_components/PhoneInput.tsx`
- `frontend/apps/web/app/(auth)/signup/_components/TermsAgreement.tsx`
- `frontend/apps/web/app/(auth)/signup/_lib/signup-state.ts`
- `frontend/apps/web/test/(auth)/signup.test.tsx`

**Modify:**
- `frontend/packages/types/src/user.ts` — `Grade`·`College` 타입·표시명·`SignupPayload` 확장
- `frontend/packages/schemas/src/index.ts` — `signupSchema` 확장 + `password.ts` 재노출
- `frontend/packages/api/src/client.ts` — `signup()` 페이로드 갱신 (시그니처만)
- `frontend/apps/web/app/(auth)/signup/page.tsx` — 2-step 위저드 wrapper

### 프론트엔드 (PR 3)

**Create:**
- `frontend/apps/web/app/(auth)/layout.tsx`
- `frontend/apps/web/app/(auth)/_components/AuthCard.tsx`

**Modify:**
- `frontend/apps/web/app/(auth)/login/page.tsx` — 카드 레이아웃 + PW 표시 토글 + 에러 배너

---

# PR 1 — Backend: User Profile Fields

## Task 1: 브랜치 생성 + Flyway 마이그레이션

**Files:**
- Create: `backend/src/main/resources/db/migration/V19__add_user_profile_columns.sql`

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout develop && git pull
git checkout -b feat/xx-user-profile-fields
```

- [ ] **Step 2: V19 마이그레이션 작성**

`backend/src/main/resources/db/migration/V19__add_user_profile_columns.sql`:

```sql
ALTER TABLE users
    ADD COLUMN grade           VARCHAR(20),
    ADD COLUMN college         VARCHAR(40),
    ADD COLUMN major           VARCHAR(50),
    ADD COLUMN phone           VARCHAR(13),
    ADD COLUMN terms_agreed_at TIMESTAMP;

-- develop 단계 테스트 계정에 백필 (운영 배포 전 별도 backfill 마이그레이션을 추가한다)
UPDATE users
SET grade           = 'FRESHMAN',
    college         = 'IT_ENGINEERING',
    major           = '미설정',
    phone           = '010-0000-0000',
    terms_agreed_at = NOW()
WHERE grade IS NULL;

ALTER TABLE users
    ALTER COLUMN grade SET NOT NULL,
    ALTER COLUMN college SET NOT NULL,
    ALTER COLUMN major SET NOT NULL,
    ALTER COLUMN phone SET NOT NULL,
    ALTER COLUMN terms_agreed_at SET NOT NULL;

ALTER TABLE users
    ADD CONSTRAINT users_phone_format_chk
        CHECK (phone ~ '^010-[0-9]{4}-[0-9]{4}$' OR phone = '010-0000-0000');

CREATE UNIQUE INDEX ux_users_phone
    ON users (phone)
    WHERE deleted_at IS NULL AND phone <> '010-0000-0000';
```

> 백필 값 `010-0000-0000` 은 UNIQUE 위반을 피하기 위해 UNIQUE INDEX 의 WHERE 절에서 제외한다. 백필 후 신규 가입은 정상 정규식을 따른다.

- [ ] **Step 3: 빌드 실행해 SQL 구문 오류 확인**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V19__add_user_profile_columns.sql
git commit -m "feat(backend): users 테이블에 학년·단과·전공·전화·약관동의 컬럼 추가"
```

---

## Task 2: Grade · College Enum

**Files:**
- Create: `backend/src/main/java/com/duing/domain/user/entity/Grade.java`
- Create: `backend/src/main/java/com/duing/domain/user/entity/College.java`

- [ ] **Step 1: Grade enum 작성**

`backend/src/main/java/com/duing/domain/user/entity/Grade.java`:

```java
package com.duing.domain.user.entity;

public enum Grade {
    FRESHMAN("1학년"),
    SOPHOMORE("2학년"),
    JUNIOR("3학년"),
    SENIOR("4학년"),
    GRADUATE_DEFERRED("졸업유예");

    private final String displayName;

    Grade(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
```

- [ ] **Step 2: College enum 작성**

`backend/src/main/java/com/duing/domain/user/entity/College.java`:

```java
package com.duing.domain.user.entity;

public enum College {
    PUBLIC_LEADERS("공공인재대학"),
    GLOBAL_BUSINESS("글로벌경영대학"),
    SOCIAL_SCIENCE("사회과학대학"),
    HEALTH_BIO("보건바이오대학"),
    IT_ENGINEERING("IT·공과대학"),
    DESIGN_ART("디자인예술대학"),
    EDUCATION("사범대학"),
    REHABILITATION("재활과학대학"),
    NURSING("간호대학"),
    GLOCAL_LIFE("글로컬라이프대학"),
    INTERNATIONAL("국제대학"),
    SPORTS_LEISURE("체육레저학부"),
    CULTURE_CONTENTS("문화콘텐츠학부"),
    FREE_MAJOR("자유전공학부");

    private final String displayName;

    College(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
```

- [ ] **Step 3: 컴파일**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/entity/Grade.java backend/src/main/java/com/duing/domain/user/entity/College.java
git commit -m "feat(backend): User 도메인에 Grade·College enum 추가"
```

---

## Task 3: User 엔티티 확장 (TDD)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/entity/User.java`
- Create: `backend/src/test/java/com/duing/domain/user/entity/UserCreateTest.java`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/test/java/com/duing/domain/user/entity/UserCreateTest.java`:

```java
package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UserCreateTest {

    @Test
    @DisplayName("User.create 는 학년·단과·전공·전화번호·약관동의시각을 모두 보관한다")
    void createPopulatesProfileFields() {
        LocalDateTime termsAgreedAt = LocalDateTime.now();

        User user = User.create(
                "20240001",
                "홍길동",
                "hong@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.JUNIOR,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "010-1234-5678",
                termsAgreedAt
        );

        assertThat(user.getGrade()).isEqualTo(Grade.JUNIOR);
        assertThat(user.getCollege()).isEqualTo(College.IT_ENGINEERING);
        assertThat(user.getMajor()).isEqualTo("컴퓨터정보공학부");
        assertThat(user.getPhone()).isEqualTo("010-1234-5678");
        assertThat(user.getTermsAgreedAt()).isEqualTo(termsAgreedAt);
    }
}
```

- [ ] **Step 2: 테스트 실행, 컴파일 실패 확인**

Run: `cd backend && ./gradlew test --tests UserCreateTest`
Expected: FAIL — `User.create` 시그니처 불일치

- [ ] **Step 3: User 엔티티 수정**

`backend/src/main/java/com/duing/domain/user/entity/User.java` 전체 교체:

```java
package com.duing.domain.user.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE users SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class User extends BaseEntity {

    @Column(name = "student_id", nullable = false, unique = true, length = 20)
    private String studentId;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(nullable = false, unique = true, length = 100)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Grade grade;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private College college;

    @Column(nullable = false, length = 50)
    private String major;

    @Column(nullable = false, length = 13)
    private String phone;

    @Column(name = "terms_agreed_at", nullable = false)
    private LocalDateTime termsAgreedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private User(
            String studentId,
            String name,
            String email,
            String passwordHash,
            UserRole role,
            Grade grade,
            College college,
            String major,
            String phone,
            LocalDateTime termsAgreedAt
    ) {
        this.studentId = studentId;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.grade = grade;
        this.college = college;
        this.major = major;
        this.phone = phone;
        this.termsAgreedAt = termsAgreedAt;
    }

    public static User create(
            String studentId,
            String name,
            String email,
            String passwordHash,
            UserRole role,
            Grade grade,
            College college,
            String major,
            String phone,
            LocalDateTime termsAgreedAt
    ) {
        return User.builder()
                .studentId(studentId)
                .name(name)
                .email(email)
                .passwordHash(passwordHash)
                .role(role)
                .grade(grade)
                .college(college)
                .major(major)
                .phone(phone)
                .termsAgreedAt(termsAgreedAt)
                .build();
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests UserCreateTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/entity/User.java backend/src/test/java/com/duing/domain/user/entity/UserCreateTest.java
git commit -m "feat(backend): User 엔티티에 프로필 필드 5개 추가"
```

---

## Task 4: UserRepository · UserException 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/repository/UserRepository.java`
- Modify: `backend/src/main/java/com/duing/domain/user/exception/UserException.java`

- [ ] **Step 1: `existsByPhone` 추가**

`backend/src/main/java/com/duing/domain/user/repository/UserRepository.java` 에 메서드 추가:

```java
boolean existsByPhone(String phone);
```

전체 파일은 다음과 같이 된다:

```java
package com.duing.domain.user.repository;

import com.duing.domain.user.entity.User;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByStudentId(String studentId);

    boolean existsByPhone(String phone);
}
```

- [ ] **Step 2: `PhoneAlreadyExistsException` 추가**

`backend/src/main/java/com/duing/domain/user/exception/UserException.java` 클래스 끝(`InvalidCredentialsException` 다음)에 추가:

```java
    public static class PhoneAlreadyExistsException extends UserException {
        private static final String MESSAGE = "이미 등록된 전화번호입니다.";

        public PhoneAlreadyExistsException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
```

- [ ] **Step 3: 컴파일**

Run: `cd backend && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/repository/UserRepository.java backend/src/main/java/com/duing/domain/user/exception/UserException.java
git commit -m "feat(backend): UserRepository.existsByPhone 및 PhoneAlreadyExistsException 추가"
```

---

## Task 5: SignupCommand · SignupRequest 확장

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/dto/command/SignupCommand.java`
- Modify: `backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java`
- Modify: `backend/src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java`

- [ ] **Step 1: SignupCommand 확장**

`backend/src/main/java/com/duing/domain/user/service/dto/command/SignupCommand.java` 전체 교체:

```java
package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;

public record SignupCommand(
        String studentId,
        String name,
        String email,
        String rawPassword,
        Grade grade,
        College college,
        String major,
        String phone
) {}
```

- [ ] **Step 2: SignupRequest 확장**

`backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java` 전체 교체:

```java
package com.duing.domain.user.controller.dto.request;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.service.dto.command.SignupCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "학번은 필수 입력값입니다.")
        @Pattern(regexp = "\\d{7,10}", message = "학번은 7~10자리 숫자여야 합니다.")
        String studentId,

        @NotBlank(message = "이름은 필수 입력값입니다.")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다.")
        String name,

        @NotBlank(message = "이메일은 필수 입력값입니다.")
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)*daegu\\.ac\\.kr$",
                message = "대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다."
        )
        @Size(max = 100, message = "이메일은 100자 이하여야 합니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수 입력값입니다.")
        @Pattern(
                regexp = "^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])|(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\",./<>?])).+$",
                message = "비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다."
        )
        String password,

        @NotNull(message = "학년은 필수 입력값입니다.")
        Grade grade,

        @NotNull(message = "단과대학은 필수 입력값입니다.")
        College college,

        @NotBlank(message = "전공 학과는 필수 입력값입니다.")
        @Size(max = 50, message = "전공 학과는 50자 이하여야 합니다.")
        String major,

        @NotBlank(message = "전화번호는 필수 입력값입니다.")
        @Pattern(regexp = "^010-\\d{4}-\\d{4}$", message = "전화번호는 010-XXXX-XXXX 형식이어야 합니다.")
        String phone,

        @AssertTrue(message = "이용약관에 동의해야 합니다.")
        Boolean termsOfServiceAgreed,

        @AssertTrue(message = "개인정보 수집·이용에 동의해야 합니다.")
        Boolean privacyPolicyAgreed
) {
    public SignupCommand toCommand() {
        return new SignupCommand(studentId, name, email, password, grade, college, major, phone);
    }
}
```

- [ ] **Step 3: 기존 SignupRequestEmailValidationTest helper 보정**

`backend/src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java` 의 `withEmail` 메서드를 새 생성자에 맞춘다:

```java
    private SignupRequest withEmail(String email) {
        return new SignupRequest(
                "20240001",
                "홍길동",
                email,
                "Abcd1234!",
                com.duing.domain.user.entity.Grade.FRESHMAN,
                com.duing.domain.user.entity.College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "010-1234-5678",
                true,
                true
        );
    }
```

- [ ] **Step 4: 기존 이메일 검증 테스트가 여전히 통과하는지 확인**

Run: `cd backend && ./gradlew test --tests SignupRequestEmailValidationTest`
Expected: PASS (모든 이메일 케이스)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/dto/command/SignupCommand.java backend/src/main/java/com/duing/domain/user/controller/dto/request/SignupRequest.java backend/src/test/java/com/duing/domain/user/controller/dto/request/SignupRequestEmailValidationTest.java
git commit -m "feat(backend): SignupRequest·SignupCommand 에 프로필 필드 및 약관 동의 추가"
```

---

## Task 6: GeneralUserService 확장 (TDD — 신규 인수 테스트)

**Files:**
- Modify: `backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java`
- Create: `backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java`

- [ ] **Step 1: 인수 테스트 작성 (성공 케이스만 먼저)**

`backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java`:

```java
package com.duing.domain.user.controller;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;

import com.duing.common.IntegrationTestSupport;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import io.restassured.http.ContentType;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

class AuthControllerSignupTest extends IntegrationTestSupport {

    @Autowired
    private UserRepository userRepository;

    private Map<String, Object> validBody() {
        return Map.of(
                "studentId", "20240001",
                "name", "홍길동",
                "email", "hong@daegu.ac.kr",
                "password", "Abcd1234!",
                "grade", "JUNIOR",
                "college", "IT_ENGINEERING",
                "major", "컴퓨터정보공학부",
                "phone", "010-1234-5678",
                "termsOfServiceAgreed", true,
                "privacyPolicyAgreed", true
        );
    }

    @Test
    @DisplayName("프로필 필드를 모두 포함한 회원가입은 201 을 반환하고 termsAgreedAt 이 저장된다")
    void signupSucceedsWithProfileFields() {
        Long userId = given().contentType(ContentType.JSON).body(validBody())
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value())
                .body("data", notNullValue())
                .extract().jsonPath().getLong("data");

        User saved = userRepository.findById(userId).orElseThrow();
        assertThat(saved.getPhone()).isEqualTo("010-1234-5678");
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getMajor()).isEqualTo("컴퓨터정보공학부");
    }
}
```

> `IntegrationTestSupport` 가 프로젝트 내 기존 통합 테스트 베이스라고 가정한다. 실제 베이스 클래스명은 `backend/src/test/java/com/duing/common/` 또는 같은 도메인의 기존 컨트롤러 테스트(`ClubPhotoControllerTest` 등)에서 사용하는 것을 그대로 채택한다. 없으면 `@SpringBootTest(webEnvironment = RANDOM_PORT)` + RestAssured 베이스로 신규 작성.

- [ ] **Step 2: 테스트 실행, 실패 확인**

Run: `cd backend && ./gradlew test --tests AuthControllerSignupTest`
Expected: FAIL — `User.create` 호출 시 누락 인자, 또는 phone 중복 체크 없음

- [ ] **Step 3: GeneralUserService.signup 수정**

`backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java` 의 `signup` 메서드 교체:

```java
    @Override
    @Transactional
    public Long signup(SignupCommand signupCommand) {
        if (userRepository.existsByEmail(signupCommand.email())) {
            throw new UserException.DuplicateEmailException();
        }
        if (userRepository.existsByStudentId(signupCommand.studentId())) {
            throw new UserException.DuplicateStudentIdException();
        }
        if (userRepository.existsByPhone(signupCommand.phone())) {
            throw new UserException.PhoneAlreadyExistsException();
        }

        String passwordHash = passwordEncoder.encode(signupCommand.rawPassword());
        User user = User.create(
                signupCommand.studentId(),
                signupCommand.name(),
                signupCommand.email(),
                passwordHash,
                UserRole.STUDENT,
                signupCommand.grade(),
                signupCommand.college(),
                signupCommand.major(),
                signupCommand.phone(),
                java.time.LocalDateTime.now()
        );
        return userRepository.save(user).getId();
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests AuthControllerSignupTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/duing/domain/user/service/GeneralUserService.java backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java
git commit -m "feat(backend): 회원가입 서비스에 프로필 필드 저장 및 전화번호 중복 검증 추가"
```

---

## Task 7: 추가 인수 테스트 (실패 경로)

**Files:**
- Modify: `backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java`

- [ ] **Step 1: 약관 미동의 · 전화번호 형식 오류 · PW 강도 미달 · 단과대학 enum 외 값 · 전화번호 중복 5개 케이스 추가**

`AuthControllerSignupTest` 에 메서드 추가:

```java
    @Test
    @DisplayName("이용약관 또는 개인정보 동의가 false 면 400 을 반환한다")
    void signupRejectsWhenTermsNotAgreed() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("privacyPolicyAgreed", false);

        given().contentType(ContentType.JSON).body(body)
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("전화번호 형식이 010-XXXX-XXXX 가 아니면 400 을 반환한다")
    void signupRejectsInvalidPhoneFormat() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("phone", "01012345678");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("비밀번호가 영문만으로 구성되면 400 을 반환한다")
    void signupRejectsWeakPasswordAlphaOnly() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("password", "abcdefghij");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("단과대학 enum 외 값을 보내면 400 을 반환한다")
    void signupRejectsUnknownCollege() {
        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("college", "UNKNOWN_COLLEGE");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.BAD_REQUEST.value());
    }

    @Test
    @DisplayName("동일 전화번호로 재가입을 시도하면 409 를 반환한다")
    void signupRejectsDuplicatePhone() {
        given().contentType(ContentType.JSON).body(validBody())
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.CREATED.value());

        java.util.Map<String, Object> body = new java.util.HashMap<>(validBody());
        body.put("studentId", "20240002");
        body.put("email", "second@daegu.ac.kr");

        given().contentType(ContentType.JSON).body(body)
                .when().post("/auth/signup")
                .then().statusCode(HttpStatus.CONFLICT.value());
    }
```

- [ ] **Step 2: 모든 테스트 통과 확인**

Run: `cd backend && ./gradlew test --tests AuthControllerSignupTest`
Expected: PASS (총 6 케이스)

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/duing/domain/user/controller/AuthControllerSignupTest.java
git commit -m "test(backend): 회원가입 검증 실패·중복 케이스 인수 테스트 추가"
```

---

## Task 8: 전체 테스트 회귀 + PR 1 마무리

- [ ] **Step 1: 전체 테스트 실행**

Run: `cd backend && ./gradlew test`
Expected: BUILD SUCCESSFUL — 기존 테스트 모두 PASS

만약 다른 도메인 테스트(`Club*Test` 등) 가 fixture 로 `User.create(...)` 를 사용하고 있다면 새 시그니처로 보정한다. (예상되는 위치: `backend/src/test/java/com/duing/common/fixture/` 또는 각 도메인 service test). 컴파일 오류 발생 시 fixture 의 `User.create` 호출을 다음 디폴트로 수정한다:

```java
User.create(
    studentId, name, email, passwordHash, UserRole.STUDENT,
    Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", java.time.LocalDateTime.now()
)
```

- [ ] **Step 2: fixture 수정이 있었다면 commit**

```bash
git add -A
git commit -m "test(backend): 기존 fixture 의 User.create 호출을 새 시그니처에 맞춰 보정"
```

- [ ] **Step 3: 푸시 + PR 생성**

```bash
git push -u origin feat/xx-user-profile-fields
gh pr create --base develop --title "feat(backend): 회원가입 시 학년·단과·전공·전화·약관 동의 수집" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원가입 시 학년, 단과대학, 전공 학과, 전화번호, 약관 동의를 추가로 수집하도록 User 엔티티와 회원가입 API 를 확장했다. 단과대학과 단독 학부 14개는 하나의 College enum 으로 통일했고, 약관 동의는 두 항목 모두 필수이며 동의 시각만 단일 컬럼으로 저장한다.

## 🤔 고민했던 내용
새 컬럼을 User 엔티티에 직접 둘지 UserProfile 로 분리할지 검토했다. MVP 단계에서는 JOIN 비용과 구현 복잡도를 줄이는 것이 우선이라 직접 추가를 택했다. 약관 버전 추적 요구가 생기면 그 시점에 별도 테이블로 분리한다.

## 💬 리뷰 중점사항
전화번호 UNIQUE 인덱스에 백필 더미값을 제외하는 partial WHERE 조건이 정확한지, 그리고 비밀번호 강도 정규식(2종 이상)이 의도대로 동작하는지 확인 부탁드린다.
EOF
)"
```

---

# PR 2 — Frontend: Signup Wizard

> **선행 조건:** PR 1 머지 완료 후 develop pull 받은 상태에서 시작.

## Task 9: 브랜치 + 공용 PW 강도 스키마

**Files:**
- Create: `frontend/packages/schemas/src/password.ts`

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout develop && git pull
git checkout -b feat/xx-signup-wizard
```

- [ ] **Step 2: PW 강도 모듈 작성**

`frontend/packages/schemas/src/password.ts`:

```ts
import { z } from 'zod';

// 백엔드 SignupRequest 의 password @Pattern 과 동일 규칙.
// 8~20자 + 영문/숫자/특수문자 중 2종 이상.
const PASSWORD_REGEX =
  /^(?=.{8,20}$)(?:(?=.*[A-Za-z])(?=.*\d)|(?=.*[A-Za-z])(?=.*[!@#$%^&*()_+\-=\[\]{};':",./<>?])|(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':",./<>?])).+$/;

export const passwordSchema = z
  .string()
  .min(1, '비밀번호는 필수 입력값입니다.')
  .regex(
    PASSWORD_REGEX,
    '비밀번호는 8~20자이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다.',
  );
```

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/schemas/src/password.ts
git commit -m "feat(frontend): 회원가입 비밀번호 강도 검증 스키마 추가"
```

---

## Task 10: types/user.ts 확장

**Files:**
- Modify: `frontend/packages/types/src/user.ts`

- [ ] **Step 1: Grade/College 타입과 표시명, SignupPayload 확장**

`frontend/packages/types/src/user.ts` 전체 교체:

```ts
// Global role (시스템 전역). Club-scoped role 은 ClubMemberRole 참조.
export type UserRole = 'STUDENT' | 'ADMIN';

export type Grade = 'FRESHMAN' | 'SOPHOMORE' | 'JUNIOR' | 'SENIOR' | 'GRADUATE_DEFERRED';

export const GRADE_DISPLAY_NAME: Record<Grade, string> = {
  FRESHMAN: '1학년',
  SOPHOMORE: '2학년',
  JUNIOR: '3학년',
  SENIOR: '4학년',
  GRADUATE_DEFERRED: '졸업유예',
};

export const GRADE_OPTIONS: ReadonlyArray<Grade> = [
  'FRESHMAN',
  'SOPHOMORE',
  'JUNIOR',
  'SENIOR',
  'GRADUATE_DEFERRED',
];

export type College =
  | 'PUBLIC_LEADERS'
  | 'GLOBAL_BUSINESS'
  | 'SOCIAL_SCIENCE'
  | 'HEALTH_BIO'
  | 'IT_ENGINEERING'
  | 'DESIGN_ART'
  | 'EDUCATION'
  | 'REHABILITATION'
  | 'NURSING'
  | 'GLOCAL_LIFE'
  | 'INTERNATIONAL'
  | 'SPORTS_LEISURE'
  | 'CULTURE_CONTENTS'
  | 'FREE_MAJOR';

export const COLLEGE_DISPLAY_NAME: Record<College, string> = {
  PUBLIC_LEADERS: '공공인재대학',
  GLOBAL_BUSINESS: '글로벌경영대학',
  SOCIAL_SCIENCE: '사회과학대학',
  HEALTH_BIO: '보건바이오대학',
  IT_ENGINEERING: 'IT·공과대학',
  DESIGN_ART: '디자인예술대학',
  EDUCATION: '사범대학',
  REHABILITATION: '재활과학대학',
  NURSING: '간호대학',
  GLOCAL_LIFE: '글로컬라이프대학',
  INTERNATIONAL: '국제대학',
  SPORTS_LEISURE: '체육레저학부',
  CULTURE_CONTENTS: '문화콘텐츠학부',
  FREE_MAJOR: '자유전공학부',
};

export const COLLEGE_OPTIONS: ReadonlyArray<College> = [
  'PUBLIC_LEADERS',
  'GLOBAL_BUSINESS',
  'SOCIAL_SCIENCE',
  'HEALTH_BIO',
  'IT_ENGINEERING',
  'DESIGN_ART',
  'EDUCATION',
  'REHABILITATION',
  'NURSING',
  'GLOCAL_LIFE',
  'INTERNATIONAL',
  'SPORTS_LEISURE',
  'CULTURE_CONTENTS',
  'FREE_MAJOR',
];

export type User = {
  id: number;
  studentId: string;
  name: string;
  email: string;
  role: UserRole;
};

export type SignupPayload = {
  studentId: string;
  name: string;
  email: string;
  password: string;
  grade: Grade;
  college: College;
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  user: User;
};
```

- [ ] **Step 2: 타입 검사**

Run: `cd frontend && pnpm typecheck`
Expected: 회원가입 페이지 외 모든 패키지 타입 통과. `(auth)/signup/page.tsx` 에서 SignupPayload 누락 필드 에러가 나는 것은 다음 Task 에서 해결한다.

만약 위저드 외 다른 곳에서 `SignupPayload` 를 사용하는 경우가 있으면 그 호출부도 갱신해야 한다. 현재 검색 기준:

```bash
grep -rn "SignupPayload" frontend/packages frontend/apps
```

검색 결과는 위저드 페이지 외에는 없어야 한다. 있으면 이 Task 안에서 함께 갱신.

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/types/src/user.ts
git commit -m "feat(frontend): Grade·College 타입과 표시명 매핑 추가"
```

---

## Task 11: schemas/index.ts 의 signupSchema 확장

**Files:**
- Modify: `frontend/packages/schemas/src/index.ts`

- [ ] **Step 1: signupSchema 교체 + password 모듈 재노출**

`frontend/packages/schemas/src/index.ts` 의 `signupSchema`/`loginSchema` 블록을 다음으로 교체 (다른 스키마는 그대로 유지):

```ts
// 백엔드 Bean Validation 규칙(@NotBlank/@Email/@Pattern/@Size/@AssertTrue 등)을 미러링한 Zod 스키마.
// 한국어 메시지는 백엔드와 동일하게 유지한다.

import { z } from 'zod';
import { passwordSchema } from './password';

export { passwordSchema } from './password';

const GRADE_VALUES = ['FRESHMAN', 'SOPHOMORE', 'JUNIOR', 'SENIOR', 'GRADUATE_DEFERRED'] as const;
const COLLEGE_VALUES = [
  'PUBLIC_LEADERS',
  'GLOBAL_BUSINESS',
  'SOCIAL_SCIENCE',
  'HEALTH_BIO',
  'IT_ENGINEERING',
  'DESIGN_ART',
  'EDUCATION',
  'REHABILITATION',
  'NURSING',
  'GLOCAL_LIFE',
  'INTERNATIONAL',
  'SPORTS_LEISURE',
  'CULTURE_CONTENTS',
  'FREE_MAJOR',
] as const;

export const signupSchema = z.object({
  studentId: z
    .string()
    .min(1, '학번은 필수 입력값입니다.')
    .regex(/^\d{7,10}$/, '학번은 7~10자리 숫자여야 합니다.'),
  name: z
    .string()
    .min(1, '이름은 필수 입력값입니다.')
    .max(50, '이름은 50자 이하여야 합니다.'),
  email: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('올바른 이메일 형식이 아닙니다.')
    .max(100, '이메일은 100자 이하여야 합니다.')
    .regex(
      /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*daegu\.ac\.kr$/,
      '대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다.',
    ),
  password: passwordSchema,
  grade: z.enum(GRADE_VALUES, { errorMap: () => ({ message: '학년을 선택해주세요.' }) }),
  college: z.enum(COLLEGE_VALUES, { errorMap: () => ({ message: '단과대학을 선택해주세요.' }) }),
  major: z
    .string()
    .min(1, '전공 학과는 필수 입력값입니다.')
    .max(50, '전공 학과는 50자 이하여야 합니다.'),
  phone: z
    .string()
    .regex(/^010-\d{4}-\d{4}$/, '전화번호는 010-XXXX-XXXX 형식이어야 합니다.'),
  termsOfServiceAgreed: z.literal(true, {
    errorMap: () => ({ message: '이용약관에 동의해야 합니다.' }),
  }),
  privacyPolicyAgreed: z.literal(true, {
    errorMap: () => ({ message: '개인정보 수집·이용에 동의해야 합니다.' }),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '이메일은 필수 입력값입니다.')
    .email('올바른 이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호는 필수 입력값입니다.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

> 파일의 나머지(`createRecruitmentSchema`, `updateRecruitmentSchema`, `updateClubSchema`) 는 그대로 둔다.

- [ ] **Step 2: 타입 검사**

Run: `cd frontend && pnpm typecheck`
Expected: 회원가입 페이지에서 새 필드 누락 에러는 남아 있고 (다음 태스크에서 해결), 다른 패키지는 통과.

- [ ] **Step 3: Commit**

```bash
git add frontend/packages/schemas/src/index.ts
git commit -m "feat(frontend): signupSchema 에 프로필 필드 및 약관 동의 검증 추가"
```

---

## Task 12: signup wizard — 상태 + sub-components

**Files:**
- Create: `frontend/apps/web/app/(auth)/signup/_lib/signup-state.ts`
- Create: `frontend/apps/web/app/(auth)/signup/_components/PhoneInput.tsx`
- Create: `frontend/apps/web/app/(auth)/signup/_components/GradeSelect.tsx`
- Create: `frontend/apps/web/app/(auth)/signup/_components/CollegeSelect.tsx`
- Create: `frontend/apps/web/app/(auth)/signup/_components/TermsAgreement.tsx`

- [ ] **Step 1: 상태 모듈 작성**

`frontend/apps/web/app/(auth)/signup/_lib/signup-state.ts`:

```ts
import type { College, Grade } from '@duing/types';

export type SignupFormState = {
  // step 1
  email: string;
  password: string;
  passwordConfirm: string;
  // step 2
  name: string;
  studentId: string;
  grade: Grade | '';
  college: College | '';
  major: string;
  phone: string;
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
};

export const initialSignupState: SignupFormState = {
  email: '',
  password: '',
  passwordConfirm: '',
  name: '',
  studentId: '',
  grade: '',
  college: '',
  major: '',
  phone: '',
  termsOfServiceAgreed: false,
  privacyPolicyAgreed: false,
};

export type SignupAction =
  | { type: 'SET_FIELD'; field: keyof SignupFormState; value: string | boolean };

export function signupReducer(state: SignupFormState, action: SignupAction): SignupFormState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    default:
      return state;
  }
}
```

- [ ] **Step 2: PhoneInput 작성 (자동 하이픈)**

`frontend/apps/web/app/(auth)/signup/_components/PhoneInput.tsx`:

```tsx
'use client';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function PhoneInput({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">전화번호</span>
      <input
        required
        inputMode="numeric"
        autoComplete="tel"
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
        placeholder="010-1234-5678"
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
```

- [ ] **Step 3: GradeSelect / CollegeSelect 작성**

`frontend/apps/web/app/(auth)/signup/_components/GradeSelect.tsx`:

```tsx
'use client';

import { GRADE_DISPLAY_NAME, GRADE_OPTIONS, type Grade } from '@duing/types';

type Props = {
  value: Grade | '';
  onChange: (next: Grade) => void;
};

export function GradeSelect({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">학년</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as Grade)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="" disabled>학년 선택</option>
        {GRADE_OPTIONS.map((grade) => (
          <option key={grade} value={grade}>
            {GRADE_DISPLAY_NAME[grade]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

`frontend/apps/web/app/(auth)/signup/_components/CollegeSelect.tsx`:

```tsx
'use client';

import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS, type College } from '@duing/types';

type Props = {
  value: College | '';
  onChange: (next: College) => void;
};

export function CollegeSelect({ value, onChange }: Props) {
  return (
    <label className="block">
      <span className="text-sm text-slate-600">단과대학/학부</span>
      <select
        required
        value={value}
        onChange={(event) => onChange(event.target.value as College)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="" disabled>단과대학/학부 선택</option>
        {COLLEGE_OPTIONS.map((college) => (
          <option key={college} value={college}>
            {COLLEGE_DISPLAY_NAME[college]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: TermsAgreement 작성 (모두 동의 토글)**

`frontend/apps/web/app/(auth)/signup/_components/TermsAgreement.tsx`:

```tsx
'use client';

type Props = {
  termsOfServiceAgreed: boolean;
  privacyPolicyAgreed: boolean;
  onChangeTermsOfService: (next: boolean) => void;
  onChangePrivacyPolicy: (next: boolean) => void;
};

export function TermsAgreement({
  termsOfServiceAgreed,
  privacyPolicyAgreed,
  onChangeTermsOfService,
  onChangePrivacyPolicy,
}: Props) {
  const allAgreed = termsOfServiceAgreed && privacyPolicyAgreed;

  function toggleAll(next: boolean) {
    onChangeTermsOfService(next);
    onChangePrivacyPolicy(next);
  }

  return (
    <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={allAgreed}
          onChange={(event) => toggleAll(event.target.checked)}
        />
        모두 동의합니다
      </label>
      <div className="border-t border-slate-200 pt-2 space-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={termsOfServiceAgreed}
            onChange={(event) => onChangeTermsOfService(event.target.checked)}
          />
          (필수) 이용약관에 동의합니다.
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={privacyPolicyAgreed}
            onChange={(event) => onChangePrivacyPolicy(event.target.checked)}
          />
          (필수) 개인정보 수집·이용에 동의합니다.
        </label>
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 5: 타입 검사**

Run: `cd frontend && pnpm typecheck`
Expected: 새 컴포넌트들 자체는 통과. `signup/page.tsx` 는 아직 미수정이므로 다음 태스크에서 정리.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/web/app/\(auth\)/signup/_lib frontend/apps/web/app/\(auth\)/signup/_components
git commit -m "feat(frontend): 회원가입 위저드용 상태·필드 컴포넌트 추가"
```

---

## Task 13: signup wizard — Step 컴포넌트 + page.tsx 조립

**Files:**
- Create: `frontend/apps/web/app/(auth)/signup/_components/SignupStepAccount.tsx`
- Create: `frontend/apps/web/app/(auth)/signup/_components/SignupStepProfile.tsx`
- Modify: `frontend/apps/web/app/(auth)/signup/page.tsx`

- [ ] **Step 1: SignupStepAccount 작성**

`frontend/apps/web/app/(auth)/signup/_components/SignupStepAccount.tsx`:

```tsx
'use client';

import type { SignupFormState } from '../_lib/signup-state';

type Props = {
  state: SignupFormState;
  onField: (field: keyof SignupFormState, value: string) => void;
  onNext: () => void;
  error: string | null;
};

export function SignupStepAccount({ state, onField, onNext, error }: Props) {
  const passwordMismatch =
    state.passwordConfirm.length > 0 && state.password !== state.passwordConfirm;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          required
          type="email"
          autoComplete="username"
          value={state.email}
          onChange={(event) => onField('email', event.target.value)}
          placeholder="hong@daegu.ac.kr"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-slate-500">
          대구대학교(@daegu.ac.kr) 이메일만 사용 가능합니다.
        </span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={state.password}
          onChange={(event) => onField('password', event.target.value)}
          placeholder="8~20자, 영문/숫자/특수문자 중 2종 이상"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호 확인</span>
        <input
          required
          type="password"
          autoComplete="new-password"
          value={state.passwordConfirm}
          onChange={(event) => onField('passwordConfirm', event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
        {passwordMismatch && (
          <span className="mt-1 block text-xs text-rose-600">
            비밀번호가 일치하지 않습니다.
          </span>
        )}
      </label>
      {error && <p className="text-sm text-rose-600" aria-live="polite">{error}</p>}
      <button
        type="submit"
        disabled={passwordMismatch}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        다음
      </button>
    </form>
  );
}
```

- [ ] **Step 2: SignupStepProfile 작성**

`frontend/apps/web/app/(auth)/signup/_components/SignupStepProfile.tsx`:

```tsx
'use client';

import type { College, Grade } from '@duing/types';
import type { SignupFormState } from '../_lib/signup-state';
import { CollegeSelect } from './CollegeSelect';
import { GradeSelect } from './GradeSelect';
import { PhoneInput } from './PhoneInput';
import { TermsAgreement } from './TermsAgreement';

type Props = {
  state: SignupFormState;
  onField: (field: keyof SignupFormState, value: string | boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
};

export function SignupStepProfile({ state, onField, onBack, onSubmit, submitting, error }: Props) {
  const canSubmit =
    state.termsOfServiceAgreed && state.privacyPolicyAgreed && !submitting;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-sm text-slate-600">이름</span>
        <input
          required
          maxLength={50}
          autoFocus
          value={state.name}
          onChange={(event) => onField('name', event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">학번</span>
        <input
          required
          pattern="\d{7,10}"
          inputMode="numeric"
          value={state.studentId}
          onChange={(event) => onField('studentId', event.target.value)}
          placeholder="7~10자리 숫자"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <GradeSelect
        value={state.grade}
        onChange={(grade: Grade) => onField('grade', grade)}
      />
      <CollegeSelect
        value={state.college}
        onChange={(college: College) => onField('college', college)}
      />
      <label className="block">
        <span className="text-sm text-slate-600">전공 학과</span>
        <input
          required
          maxLength={50}
          value={state.major}
          onChange={(event) => onField('major', event.target.value)}
          placeholder="예: 컴퓨터정보공학부"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <PhoneInput
        value={state.phone}
        onChange={(phone) => onField('phone', phone)}
      />
      <TermsAgreement
        termsOfServiceAgreed={state.termsOfServiceAgreed}
        privacyPolicyAgreed={state.privacyPolicyAgreed}
        onChangeTermsOfService={(next) => onField('termsOfServiceAgreed', next)}
        onChangePrivacyPolicy={(next) => onField('privacyPolicyAgreed', next)}
      />
      {error && <p className="text-sm text-rose-600" aria-live="polite">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-700"
        >
          이전
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? '가입 중…' : '회원가입'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: page.tsx 조립**

`frontend/apps/web/app/(auth)/signup/page.tsx` 전체 교체:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { SignupStepAccount } from './_components/SignupStepAccount';
import { SignupStepProfile } from './_components/SignupStepProfile';
import { initialSignupState, signupReducer } from './_lib/signup-state';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignupMutation();
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  function setField(field: Parameters<typeof signupReducer>[1] extends {
    field: infer F;
  }
    ? F
    : never, value: string | boolean) {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  function goToStep2() {
    setError(null);
    if (state.password !== state.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    const step1 = signupSchema.pick({ email: true, password: true })
      .safeParse({ email: state.email, password: state.password });
    if (!step1.success) {
      setError(step1.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setStep(2);
  }

  async function handleSubmit() {
    setError(null);
    const parsed = signupSchema.safeParse({
      studentId: state.studentId,
      name: state.name,
      email: state.email,
      password: state.password,
      grade: state.grade,
      college: state.college,
      major: state.major,
      phone: state.phone,
      termsOfServiceAgreed: state.termsOfServiceAgreed,
      privacyPolicyAgreed: state.privacyPolicyAgreed,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await signup.mutateAsync(parsed.data);
      router.replace('/login?next=/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <span className="text-sm text-slate-500">{step} / 2 단계</span>
      </header>
      {step === 1 ? (
        <SignupStepAccount
          state={state}
          onField={(field, value) => setField(field, value)}
          onNext={goToStep2}
          error={error}
        />
      ) : (
        <SignupStepProfile
          state={state}
          onField={(field, value) => setField(field, value)}
          onBack={() => { setError(null); setStep(1); }}
          onSubmit={handleSubmit}
          submitting={signup.isPending}
          error={error}
        />
      )}
      <p className="text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-slate-900 underline">로그인</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: 타입 검사 + 빌드**

Run: `cd frontend && pnpm typecheck && pnpm -F web build`
Expected: 둘 다 SUCCESS

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/\(auth\)/signup
git commit -m "feat(frontend): 회원가입 페이지를 2단계 위저드로 전환"
```

---

## Task 14: 위저드 단위 테스트 + PR 2 마무리

**Files:**
- Create: `frontend/apps/web/test/(auth)/signup.test.tsx`

- [ ] **Step 1: 테스트 작성**

`frontend/apps/web/test/(auth)/signup.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SignupPage from '../../app/(auth)/signup/page';
import { formatPhone } from '../../app/(auth)/signup/_components/PhoneInput';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@duing/hooks', () => ({
  useSignupMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SignupPage />
    </QueryClientProvider>,
  );
}

describe('PhoneInput formatter', () => {
  it('11자리 숫자를 입력하면 010-1234-5678 형식으로 포맷팅한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('010123')).toBe('010-123');
    expect(formatPhone('abc010!1234@5678')).toBe('010-1234-5678');
  });
});

describe('SignupPage wizard', () => {
  it('1단계 비밀번호 확인 불일치 시 "다음" 버튼이 비활성화된다', () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/hong@daegu/), {
      target: { value: 'hong@daegu.ac.kr' },
    });
    fireEvent.change(screen.getByPlaceholderText(/8~20자/), {
      target: { value: 'Abcd1234!' },
    });
    const confirm = screen.getAllByLabelText(/비밀번호 확인/)[0];
    fireEvent.change(confirm, { target: { value: 'Different1!' } });

    const nextButton = screen.getByRole('button', { name: '다음' });
    expect(nextButton).toBeDisabled();
  });
});
```

> 위 테스트 파일이 동작하려면 프로젝트의 vitest 설정에서 `@testing-library/react`·`@tanstack/react-query` 가 이미 의존성에 있어야 한다. 부재하면 기존 다른 테스트(`apps/web/test/clubs/*.test.tsx`) 와 동일한 패턴으로 import 만 맞춘다.

- [ ] **Step 2: 테스트 실행**

Run: `cd frontend && pnpm -F web test -- signup`
Expected: 모든 케이스 PASS

- [ ] **Step 3: 전체 CI 명령 모두 실행**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm -F web build && pnpm -F web test`
Expected: 모두 SUCCESS

- [ ] **Step 4: Commit + PR 생성**

```bash
git add frontend/apps/web/test/\(auth\)/signup.test.tsx
git commit -m "test(frontend): 회원가입 위저드 단계 전환 및 전화번호 포맷 단위 테스트 추가"

git push -u origin feat/xx-signup-wizard
gh pr create --base develop --title "feat(frontend): 회원가입 페이지 2단계 위저드 적용" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원가입 페이지를 계정 정보(이메일·비밀번호)와 소속·약관 정보 2단계로 분리한 위저드로 전환했다. 전화번호 자동 하이픈 포맷, 단과대학·학년 셀렉트, 약관 동의 일괄/개별 토글을 더했고 zod 스키마는 백엔드 정규식을 그대로 미러링한다.

## 🤔 고민했던 내용
2단계 분리를 URL 기반(`/signup/account`, `/signup/profile`)으로 갈지, 단일 페이지 step state 로 갈지 고민했다. 새로고침 시 1단계로 돌아가는 동작이 의도와 맞고 유실되는 상태도 위험하지 않아 step state 로 단순화했다.

## 💬 리뷰 중점사항
PhoneInput 자동 하이픈 로직, signupSchema 의 PW 강도 정규식이 백엔드 패턴과 일치하는지 확인 부탁드린다.
EOF
)"
```

---

# PR 3 — Frontend: Login Redesign

> **선행 조건:** PR 2 머지 완료 후 develop pull 받은 상태에서 시작.

## Task 15: 브랜치 + 공용 (auth) 레이아웃

**Files:**
- Create: `frontend/apps/web/app/(auth)/layout.tsx`
- Create: `frontend/apps/web/app/(auth)/_components/AuthCard.tsx`

- [ ] **Step 1: 브랜치 생성**

```bash
git checkout develop && git pull
git checkout -b feat/xx-login-redesign
```

- [ ] **Step 2: AuthCard 컴포넌트**

`frontend/apps/web/app/(auth)/_components/AuthCard.tsx`:

```tsx
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export function AuthCard({ children }: Props) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <header className="mb-6 text-center">
          <p className="text-xl font-bold tracking-tight text-slate-900">Du-ing</p>
          <p className="mt-1 text-xs text-slate-500">대구대학교 동아리 통합 플랫폼</p>
        </header>
        {children}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: (auth)/layout.tsx 작성**

`frontend/apps/web/app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { AuthCard } from './_components/AuthCard';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthCard>{children}</AuthCard>;
}
```

- [ ] **Step 4: 빌드로 위저드와 레이아웃이 함께 잘 렌더되는지 확인**

Run: `cd frontend && pnpm -F web build`
Expected: SUCCESS

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/\(auth\)/layout.tsx frontend/apps/web/app/\(auth\)/_components
git commit -m "feat(frontend): 회원가입·로그인 공용 카드 레이아웃 추가"
```

---

## Task 16: 로그인 페이지 리디자인

**Files:**
- Modify: `frontend/apps/web/app/(auth)/login/page.tsx`

- [ ] **Step 1: 현재 login/page.tsx 읽기**

Run: `cat frontend/apps/web/app/\(auth\)/login/page.tsx`
Expected: 기존 로그인 폼 마크업 확인

- [ ] **Step 2: 로직 그대로 두고 마크업 교체**

`frontend/apps/web/app/(auth)/login/page.tsx` 전체 교체:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLoginMutation } from '@duing/hooks';
import { loginSchema } from '@duing/schemas';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLoginMutation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await login.mutateAsync(parsed.data);
      const next = searchParams.get('next') ?? '/me';
      router.replace(next);
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">로그인</h1>
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          required
          type="email"
          autoComplete="username"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          placeholder="hong@daegu.ac.kr"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <div className="relative">
          <input
            required
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 pr-12"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
            className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-slate-500"
          >
            {showPassword ? '숨김' : '표시'}
          </button>
        </div>
      </label>
      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {login.isPending ? '로그인 중…' : '로그인'}
      </button>
      <p className="text-center text-sm text-slate-500">
        아직 회원이 아니신가요?{' '}
        <Link href="/signup" className="text-slate-900 underline">회원가입</Link>
      </p>
    </form>
  );
}
```

- [ ] **Step 3: 빌드 + 타입 검사**

Run: `cd frontend && pnpm typecheck && pnpm -F web build`
Expected: SUCCESS

- [ ] **Step 4: 개발 서버에서 시각 검증**

Run: `cd frontend && pnpm -F web dev` (백그라운드)
브라우저에서 `http://localhost:3000/login` 접속해 다음을 확인:
- 카드 레이아웃이 회원가입 페이지와 동일하게 보이는지
- 비밀번호 표시/숨김 토글이 동작하는지
- 잘못된 자격 증명 입력 시 상단 에러 배너가 나타나는지

검증 완료 후 dev 서버 종료.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/web/app/\(auth\)/login/page.tsx
git commit -m "feat(frontend): 로그인 페이지를 카드 레이아웃과 PW 표시 토글로 리디자인"
```

---

## Task 17: 회귀 테스트 + PR 3 생성

- [ ] **Step 1: 전체 CI 명령 실행**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm -F web build && pnpm -F web test`
Expected: 모두 SUCCESS

- [ ] **Step 2: 푸시 + PR 생성**

```bash
git push -u origin feat/xx-login-redesign
gh pr create --base develop --title "feat(frontend): 로그인 페이지 UI 리디자인" --body "$(cat <<'EOF'
## 🚀 작업 내용
회원가입 위저드와 시각 톤을 맞추기 위해 로그인 페이지를 공용 카드 레이아웃에 얹고, 비밀번호 표시/숨김 토글과 상단 에러 배너를 도입했다. 폼 제출 로직과 API 호출은 그대로 유지한다.

## 🤔 고민했던 내용
아이디·비밀번호 찾기 링크를 함께 둘지 검토했으나 이메일 발송 인프라가 아직 없어 동작이 불가능하므로 이번 범위에서 제외했다. 자리만 비워두면 사용자에게 혼란이 생길 것 같아 링크 자체도 노출하지 않는 쪽으로 정리했다.

## 💬 리뷰 중점사항
401 에러 메시지가 어느 필드에 의해 실패했는지 노출하지 않는 점, 그리고 `(auth)/layout.tsx` 공용 카드가 회원가입·로그인 양쪽에서 동일하게 보이는지 확인 부탁드린다.
EOF
)"
```

---

## 자체 검토 결과

- **Spec 커버리지** — 모든 spec 섹션(데이터 모델 / 마이그레이션 / API 계약 / 검증 규칙 / 프론트 위저드 / 로그인 리디자인 / 테스트)이 Task 1~17 에 매핑됨.
- **Placeholder 스캔** — TBD/TODO 없음. 마이그레이션 백필 더미값(`010-0000-0000`)은 개발 단계 한정 명시함.
- **타입 일관성** — `Grade`·`College` 키, `SignupPayload` 필드, `SignupCommand`·`User.create()` 시그니처가 PR 1·PR 2 사이에 동일하게 유지됨.
