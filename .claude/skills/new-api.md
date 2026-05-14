---
name: new-api
description: Du-ing 백엔드에 새 API 엔드포인트를 추가한다. Swagger 인터페이스 → Controller → Service → DTO → Repository → RestAssured 테스트 순으로 생성한다.
---

# new-api — API 엔드포인트 추가

**트리거**: "API 만들어줘", "엔드포인트 추가", `/new-api {도메인} {액션}`

## 사전 확인
- 대상 도메인이 존재하는지 (`domain/{x}/`). 없으면 `new-domain` 스킬을 먼저 호출.
- API 가 누구의 권한인가? 공개 / STUDENT / LEADER / ADMIN.
- DB 스키마 변경이 필요한가? 필요하면 Flyway 부터.

## URL 컨벤션
- 공개/STUDENT: `/api/v1/{resource}`
- LEADER: `/api/v1/leader/...`
- ADMIN: `/api/v1/admin/...`

## 실행 순서

1. (DB 변경 시) Flyway 마이그레이션 추가
2. **Swagger 인터페이스** — `domain/{x}/api/{Role}{X}Api.java`
   - `@Tag(name = "{도메인 한국어}")`
   - 메서드마다 `@Operation(summary = "...")`, `@ApiResponses`
3. **Controller** — `domain/{x}/controller/{Role}{X}Controller.java`
   - `implements {Role}{X}Api`
   - `@RestController`, `@RequestMapping("/api/v1")`, `@RequiredArgsConstructor`
   - 권한 검증: `@PreAuthorize("hasRole('LEADER')")` 등
   - 현재 사용자: `@AuthenticationPrincipal UserPrincipal currentUser`
4. **Request DTO** — `controller/dto/request/{Action}{X}Request.java`
   - `record`
   - `@NotNull`, `@NotBlank`, `@Size` 등 한국어 메시지
   - `toCommand()` 메서드로 Command 변환
5. **Service** — 인터페이스(`{X}Service`)에 메서드 추가, 구현체(`General{X}Service`)에 로직 구현
   - 클래스에 `@Transactional(readOnly = true)` 기본 부착
   - 쓰기 메서드만 `@Transactional` 오버라이드
6. **Command/Query DTO** — `service/dto/command/` 또는 `service/dto/query/`
   - 모두 `record`
7. **Response DTO** — `controller/dto/response/{Context}{X}Response.java`
   - `record`
   - `from(Query)` 정적 메서드로 매핑
8. **Repository 쿼리 추가**
   - 단순 단일 조건: JpaRepository 메서드명
   - 복수 동적 조건: `{X}RepositoryCustom` + QueryDSL Impl
9. **테스트** — `src/test/java/com/duing/domain/{x}/{Role}{X}ControllerTest.java`
   - RestAssured + `@DisplayName` 요구사항 문장
   - 정상 케이스 + 경계값(빈/중복/권한없음/잘못된 입력)

## 체크리스트
- [ ] `api/` 인터페이스 먼저 정의?
- [ ] 모든 DTO 가 `record`?
- [ ] Request DTO 에 `@Valid` + 한국어 메시지?
- [ ] Controller 가 `@Valid` 사용?
- [ ] 응답이 `ApiResponse<T>` 래핑? 목록은 `PageResponse<T>`?
- [ ] HTTP 상태: POST→201, GET→200, PUT/PATCH/DELETE→204?
- [ ] `@PreAuthorize` 적용?
- [ ] `@DisplayName` 이 요구사항 문장?
- [ ] 코드 작성 후 `./gradlew test --tests "*{X}Controller*"` 통과?

## 금지
- `api/` 인터페이스 없이 Controller 단독 작성
- Request/Response 와 Command/Query 를 한 패키지에 혼재
- `LocalFileStorageService` 등 구현체를 직접 import (인터페이스 타입 주입만)
