# SKILL.md — du-ing-be

자주 반복되는 구현 패턴을 스킬로 정의한다.
작업 요청 시 맥락에 맞는 스킬을 자동으로 적용한다.

---

## SKILL: new-api

**트리거**: "API 만들어줘", "엔드포인트 추가", "조회/생성/수정/삭제 API"

**실행 순서**
1. DB 변경이 필요하면 `resources/db/migration/V{다음버전}__{설명}.sql` 생성
2. `domain/{도메인}/api/{Role}{Domain}Api.java` — Swagger 인터페이스 작성
3. `domain/{도메인}/controller/{Role}{Domain}Controller.java` — 인터페이스 구현
4. `domain/{도메인}/service/{Domain}Service.java` — 비즈니스 로직
5. `domain/{도메인}/dto/command/` 또는 `dto/query/` — record DTO 작성
6. `domain/{도메인}/repository/` — 쿼리 추가 (동적 조건이면 QueryDSL)
7. `src/test/.../domain/{도메인}/` — RestAssured 테스트 작성

**체크리스트**
- [ ] `api/` 인터페이스 먼저 정의했는가?
- [ ] DTO가 `record`인가?
- [ ] Request DTO에 `@Valid`, `@NotNull` 한국어 메시지 적용했는가?
- [ ] 응답이 `ApiResponse<T>`로 감싸져 있는가?
- [ ] 인증 필요 API에 `@PreAuthorize` 적용했는가?
- [ ] `@DisplayName`이 요구사항 문장인가?

---

## SKILL: new-domain

**트리거**: "도메인 추가", "새 엔티티", "테이블 추가"

**실행 순서**
1. `db/migration/V{버전}__create_{도메인}_table.sql` 생성
2. `domain/{도메인}/entity/{Domain}.java` — JPA 엔티티 (`extends BaseEntity`, `@SQLDelete`, `@SQLRestriction`)
3. 관련 Enum을 `entity/` 하위에 함께 생성
4. `domain/{도메인}/repository/{Domain}Repository.java` — JPA Repository
5. 동적 쿼리가 예상되면 `{Domain}RepositoryCustom` + `{Domain}RepositoryImpl` 함께 생성
6. `domain/{도메인}/exception/{Domain}Exception.java` — 도메인 예외 클래스 생성
7. `common/fixture/{Domain}Fixture.java` — Fixture 추가

**체크리스트**
- [ ] 엔티티에 `@SQLDelete` + `@SQLRestriction` soft delete 적용했는가?
- [ ] Flyway 파일명 언더스코어 두 개인가? (`V2__`)
- [ ] Enum은 `entity/` 패키지에 위치하는가?
- [ ] 도메인 예외 클래스 생성했는가?

---

## SKILL: querydsl-filter

**트리거**: "검색", "필터", "동적 조건", "카테고리/상태로 조회"

**구현 패턴**

```java
// 1. 검색 조건 record
public record ClubSearchCondition(
    ClubCategory category,
    RecruitmentStatus recruitmentStatus,
    String keyword
) {}

// 2. RepositoryCustom 인터페이스
public interface ClubRepositoryCustom {
    List<Club> findByCondition(ClubSearchCondition condition);
}

// 3. RepositoryImpl 구현체
@RequiredArgsConstructor
public class ClubRepositoryImpl implements ClubRepositoryCustom {
    private final JPAQueryFactory queryFactory;

    @Override
    public List<Club> findByCondition(ClubSearchCondition condition) {
        return queryFactory
            .selectFrom(club)
            .where(
                categoryEq(condition.category()),
                recruitmentStatusEq(condition.recruitmentStatus()),
                keywordContains(condition.keyword()),
                club.deletedAt.isNull()
            )
            .orderBy(club.name.asc())
            .fetch();
    }

    private BooleanExpression categoryEq(ClubCategory category) {
        return category != null ? club.category.eq(category) : null;
    }

    private BooleanExpression recruitmentStatusEq(RecruitmentStatus status) {
        return status != null ? club.recruitmentStatus.eq(status) : null;
    }

    private BooleanExpression keywordContains(String keyword) {
        return StringUtils.hasText(keyword)
            ? club.name.containsIgnoreCase(keyword)
                .or(club.description.containsIgnoreCase(keyword))
            : null;
    }
}
```

**체크리스트**
- [ ] 각 조건이 개별 `BooleanExpression` 메서드로 분리됐는가?
- [ ] null 조건은 null 반환으로 자동 무시되는가?
- [ ] `deletedAt.isNull()` soft delete 조건 포함했는가?

---

## SKILL: file-upload

**트리거**: "이미지 업로드", "파일 업로드", "파일 저장"

**핵심 원칙**
- Controller/Service는 `FileStorageService` **인터페이스** 타입으로만 주입
- 구현체(`LocalFileStorageService`)를 직접 참조하지 않음
- 추후 S3 전환 시 `S3FileStorageService` 구현체 추가 + `@Profile` 변경만으로 완료

```java
// 인터페이스 (global/file/FileStorageService.java)
public interface FileStorageService {
    String upload(MultipartFile file, String directory);
    void delete(String fileUrl);
}

// 현재 구현체 (global/file/LocalFileStorageService.java)
@Service
@Profile("local")
@RequiredArgsConstructor
public class LocalFileStorageService implements FileStorageService {
    @Value("${file.upload-dir}")
    private String uploadDir;

    @Override
    public String upload(MultipartFile file, String directory) {
        // 로컬 경로에 저장 후 접근 URL 반환
    }

    @Override
    public void delete(String fileUrl) {
        // 로컬 파일 삭제
    }
}

// Service에서 사용
@RequiredArgsConstructor
public class FeedService {
    private final FileStorageService fileStorageService; // 인터페이스만
    private final FeedPostRepository feedPostRepository;

    public Long create(CreateFeedCommand createCommand) {
        String imageUrl = fileStorageService.upload(createCommand.imageFile(), "feeds/");
        FeedPost feedPost = createCommand.toEntity(imageUrl);
        return feedPostRepository.save(feedPost).getId();
    }
}
```

**체크리스트**
- [ ] Service가 인터페이스 타입(`FileStorageService`)으로 주입받는가?
- [ ] 파일 확장자 검증 적용했는가? (jpg, jpeg, png, gif)
- [ ] `application-local.yml`에 `file.upload-dir` 설정했는가?

---

## SKILL: jwt-auth

**트리거**: "로그인", "인증", "JWT", "토큰"

**핵심 구성 요소**
- `JwtTokenProvider` — auth0 java-jwt로 토큰 생성/검증/파싱
- `JwtAuthenticationFilter` — 요청마다 토큰 검증 및 SecurityContext 주입
- `UserPrincipal` — 인증된 사용자 정보 (id, role)
- `SecurityConfig` — 공개/인증 필요 엔드포인트 분리

**공개 엔드포인트 (인증 불필요)**
```
GET  /api/v1/clubs            동아리 목록 조회
GET  /api/v1/clubs/{id}       동아리 상세 조회
GET  /api/v1/recruitments     모집 달력 조회
POST /api/v1/auth/login       로그인
```

**체크리스트**
- [ ] JWT Secret은 환경변수(`JWT_SECRET`)로만 주입하는가?
- [ ] 토큰 만료 예외가 `GlobalExceptionHandler`에 등록됐는가?
- [ ] `@AuthenticationPrincipal UserPrincipal`로 현재 사용자 주입하는가?

---

## SKILL: error-handling

**트리거**: "예외 처리", "에러 응답", "예외 추가"

**패턴**

```java
// domain/club/exception/ClubException.java
public class ClubException extends ApplicationException {
    public static class ClubNotFoundException extends ClubException {
        private static final String MESSAGE = "동아리를 찾을 수 없습니다.";
        public ClubNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
    public static class DuplicateApplicationException extends ClubException {
        private static final String MESSAGE = "이미 지원한 동아리입니다.";
        public DuplicateApplicationException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }
}

// 서비스에서 사용
Club club = clubRepository.findById(clubId)
    .orElseThrow(ClubException.ClubNotFoundException::new);
```

**체크리스트**
- [ ] 에러 메시지는 `private static final String MESSAGE` 상수인가?
- [ ] 메시지는 사용자가 이해할 수 있는 한국어인가?
- [ ] HTTP 상태코드가 의미에 맞는가? (404, 409, 403, 400)

---

## SKILL: test-api

**트리거**: "테스트 작성", "API 테스트", "RestAssured"

**패턴**

```java
@DisplayName("모집 중인 동아리만 필터링되어 반환된다")
@Test
void filterRecruitingClubs() {
    // given
    Club recruitingClub = ClubFixture.모집중인_동아리();
    Club closedClub = ClubFixture.모집마감_동아리();
    clubRepository.saveAll(List.of(recruitingClub, closedClub));

    // when & then
    RestAssured.given().log().all()
        .queryParam("status", "OPEN")
        .when()
        .get("/api/v1/clubs")
        .then().log().all()
        .statusCode(200)
        .body("data", hasSize(1))
        .body("data[0].name", equalTo("밴드부"));
}
```

**체크리스트**
- [ ] `@DisplayName`이 요구사항 문장인가? (메서드명 금지)
- [ ] given / when / then 구조가 명확한가?
- [ ] 경계값 케이스 포함했는가? (빈 목록, 중복, 권한 없음)

---

## SKILL: flyway-migration

**트리거**: "테이블 추가", "컬럼 추가", "스키마 변경", "DB 변경"

**규칙**
- 파일명: `V{현재최고버전+1}__{스네이크케이스_설명}.sql`
- 언더스코어 **두 개** (`__`) 필수
- 기존 파일 절대 수정 금지

**예시**
```sql
-- V6__add_division_column_to_club.sql
ALTER TABLE club ADD COLUMN IF NOT EXISTS division VARCHAR(50);

-- V7__create_feed_post_table.sql
CREATE TABLE IF NOT EXISTS feed_post (
    id          BIGSERIAL PRIMARY KEY,
    club_id     BIGINT NOT NULL REFERENCES club(id),
    content     TEXT,
    image_url   VARCHAR(500),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);
```

**체크리스트**
- [ ] 버전 번호가 기존보다 크고 연속적인가?
- [ ] 언더스코어 두 개인가?
- [ ] `IF NOT EXISTS`로 재실행 안전성 확보했는가?
