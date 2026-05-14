# CLAUDE.md — du-ing-be

프로젝트 개요, 구조, 명령어, 핵심 패턴은 @backend/AGENTS.md 참조.
모노레포 구조: `backend/` (Spring Boot), `frontend/` (TBD).

---

## Claude 작업 규칙

### 시작 전
- 요청이 모호하면 먼저 질문한다
- 수정할 파일은 반드시 읽고 기존 패턴을 파악한 뒤 작업한다
- 솔루션 로직을 스스로 검토한 후 제시한다

### 코드 작성
- 기존 프로젝트 스타일과 DDD 구조를 엄격히 따른다
- 요청된 작업 범위만 수정한다 (불필요한 리팩토링 금지)
- 완전히 실행 가능한 코드만 제공한다 (의사코드 금지)
- `@Valid`, `@NotNull` 등 DTO 검증 어노테이션 적용 (한국어 메시지)
- secrets/환경변수 하드코딩 절대 금지
- **변수명은 역할이 드러나도록 작성한다** — `dto`, `r`, `e` 같은 축약 금지
  - 나쁜 예: `ClubDto dto`, `Recruitment r`, `Club e`
  - 좋은 예: `CreateClubCommand createCommand`, `Recruitment recruitment`

### 새 기능 추가 시 필수 순서
1. (DB 변경 시) `resources/db/migration/`에 Flyway 마이그레이션 파일 추가
2. `api/` 패키지에 Swagger 인터페이스 정의
3. `controller/` 구현 (인터페이스 implements)
4. `service/` + command/query DTO 작성
5. `repository/` 쿼리 추가 (복잡한 조건은 QueryDSL)
6. 테스트 작성 (RestAssured + Fixture Monkey)

### 패키지 구조 원칙
- 도메인별 패키지: `domain/{도메인명}/` 하위에 api / controller / service / repository / entity / dto 배치
- dto는 목적별로 분리: `dto/command/` (쓰기), `dto/query/` (읽기)
- 전역 설정은 `global/` 패키지에만 위치
- 모든 DTO는 Java `record` 사용

### 확장성 원칙 (추후 배포 대비)
- 파일 업로드는 `FileStorageService` 인터페이스로 추상화
  - 현재: `LocalFileStorageService` 구현체 사용
  - 추후: `S3FileStorageService` 구현체로 교체만 하면 됨
- 환경별 설정은 `application-local.yml` / `application-prod.yml`로 분리
- 시크릿은 항상 환경변수로 주입 (배포 시 그대로 사용 가능)

### 네이밍 컨벤션
- API Interface: `{Role}{Domain}Api` (예: `ClubApi`, `AdminClubApi`)
- Controller: `{Role}{Domain}Controller`
- Service: `{Domain}Service` 인터페이스 + `General{Domain}Service` 구현체
- Request/Response DTO: `{Action}{Entity}Request`, `{Context}{Entity}Response`
- Command/Query DTO: `{Action}{Entity}Command`, `{Entity}{Context}Query`
- Exception: `{Domain}Exception` 부모 클래스 + static final inner class 구체 예외

### 메서드 네이밍
- 생성: `create(Command)` → `Long` id 또는 `void`
- 단건 조회 (예외 발생): `getById(Long id)`
- 단건 조회 (Optional): `findById(Long id)`
- 삭제: `delete(Long id)`, 수정: `update(Command)`
- DTO 변환: Request → `toCommand()`, Command → `toEntity()`, Query → `Response.from()`

### 어노테이션 규칙
- `@Builder`는 생성자에, 생성자 접근자는 `private`
- 모든 연관관계는 `FetchType.LAZY`
- Service 클래스: `@Transactional(readOnly = true)` 기본, 쓰기 메서드만 `@Transactional` 오버라이드
- HTTP 상태: POST → 201, GET → 200, PUT/PATCH/DELETE → 204

### QueryDSL 사용 기준
- 단순 단일 조건 조회 → JPA Repository 메서드
- 복수 조건 동적 필터 → QueryDSL `BooleanExpression`
- QueryDSL 구현체는 반드시 `{Domain}RepositoryCustom` 인터페이스를 구현한다

### 테스트
- 코드 작성 후 `./gradlew test`로 검증한다
- 버그 수정/기능 추가 시 반드시 테스트 추가
- TestContainers 사용 — Docker 실행 상태 필요
- 테스트 데이터는 Fixture Monkey 또는 `common/fixture/`의 static 메서드로 생성한다
- `@DisplayName`은 메서드명 금지, 요구사항을 파악할 수 있는 문장으로 작성한다
  - 좋은 예: `"모집 중인 동아리만 필터링되어 반환된다"`, `"이미 지원한 동아리에 재지원하면 예외가 발생한다"`
  - 나쁜 예: `"findClubs - 모집 중 필터 동작"`, `"applyClub은 중복 지원 방지"`

---

## Git / PR 규칙

- 브랜치명: `{type}/{이슈번호}-{설명}` (예: `feat/5-club-list-api`)
- 커밋 메시지: 한국어, `[#이슈번호] 작업 내용` 형식 (예: `[#5] 동아리 목록 조회 API 구현`)
- PR 템플릿: 🚀 작업 내용 / 🤔 고민했던 내용 / 💬 리뷰 중점사항
- PR 본문은 클래스명·메서드명 나열 금지 — 작업 내용 중심의 자연스러운 글로 작성한다

### API 단위 브랜치 전략
PR 크기를 관리하기 위해 **API 1개 = 브랜치 1개 = PR 1개** 원칙을 따른다.

- 각 브랜치는 단일 기능 (구현 + 테스트) 에 대응
- 브랜치는 `develop`에서 분기, `develop`으로 PR
- 의존 관계가 있는 경우 앞 브랜치 merge 후 다음 브랜치 분기

```
develop
  └─ feat/5-club-list-api          # 동아리 목록/검색/필터
  └─ feat/6-club-detail-api        # 동아리 상세 조회
  └─ feat/7-recruitment-create     # 모집 공고 생성
  └─ feat/8-recruitment-calendar   # 모집 달력 조회
  └─ feat/9-application-submit     # 지원서 제출
  └─ feat/10-application-manage    # 지원자 관리 (동아리장)
```

---

## 에이전트 & 스킬 자동 사용 규칙

모든 에이전트(`.claude/agents/`)와 스킬(`.claude/skills/`)은 사용자가 명시적으로 요청하지 않아도,
작업 맥락에 맞으면 능동적으로 사용한다.

---

## 절대 금지

- Flyway 기존 마이그레이션 파일 수정 (새 파일 추가만 허용)
- 엔티티 물리 삭제 (`DELETE` 직접 실행) — `@SQLDelete` + `@SQLRestriction` soft delete 사용
- `api/` 인터페이스 없이 Controller 단독 작성
- `application.yml` 또는 코드 내 시크릿 값 직접 기재
- 의사코드, 미완성 코드 제공
- `FileStorageService` 구현체를 Controller/Service에서 직접 import — 반드시 인터페이스 타입으로 주입
