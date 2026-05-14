---
name: api-test
description: RestAssured + Fixture Monkey 기반 API 통합 테스트를 작성한다. @DisplayName 은 요구사항 문장, given/when/then 구조, 경계값 포함.
---

# api-test — API 통합 테스트 작성

**트리거**: "테스트 작성", "API 테스트", "RestAssured", `/api-test {대상}`

## 환경 전제

- TestContainers 로 PostgreSQL 컨테이너 기동 → Docker 데몬 필요
- RestAssured 로 실제 HTTP 호출
- Fixture Monkey 또는 `src/test/java/com/duing/common/fixture/` 의 정적 메서드로 데이터 생성

## 위치

`src/test/java/com/duing/domain/{도메인}/{Role}{Domain}ControllerTest.java`

## 작성 순서

1. 동일 도메인 Fixture 확인 → 없으면 추가
2. **정상 케이스** 부터 작성 (성공 응답·반환 필드 검증)
3. **경계값** 추가
   - 빈 결과 (필터에 해당 없음)
   - 중복 (이미 지원한 사용자 재지원 등)
   - 권한 없음 (STUDENT 가 LEADER API 호출)
   - 잘못된 입력 (`@NotBlank` 위반 등)
4. 모든 테스트는 격리된 트랜잭션 / `@Transactional` 또는 `@AfterEach` DB 정리

## 패턴

```java
@DisplayName("모집 중인 동아리만 필터링되어 반환된다")
@Test
void filterRecruitingClubs() {
    // given
    Club recruitingClub = ClubFixture.모집중인_동아리();
    Club closedClub = ClubFixture.모집마감_동아리();
    clubRepository.saveAll(List.of(recruitingClub, closedClub));

    // when & then
    RestAssured
        .given().log().all()
            .queryParam("recruitmentStatus", "OPEN")
        .when()
            .get("/api/v1/clubs")
        .then().log().all()
            .statusCode(200)
            .body("data.content", hasSize(1))
            .body("data.content[0].name", equalTo(recruitingClub.getName()));
}

@DisplayName("이미 지원한 동아리에 재지원하면 409 응답을 반환한다")
@Test
void rejectDuplicateApplication() {
    // given
    User student = userRepository.save(UserFixture.학생());
    Recruitment recruitment = recruitmentRepository.save(RecruitmentFixture.모집중());
    applicationRepository.save(ApplicationFixture.지원완료(student, recruitment));

    // when & then
    RestAssured
        .given().log().all()
            .header("Authorization", "Bearer " + jwtFor(student))
            .contentType(ContentType.JSON)
            .body(Map.of("answers", List.of()))
        .when()
            .post("/api/v1/recruitments/{id}/applications", recruitment.getId())
        .then().log().all()
            .statusCode(409)
            .body("message", equalTo("이미 지원한 동아리입니다."));
}
```

## 체크리스트

- [ ] `@DisplayName` 이 메서드명 아닌 **요구사항 문장**? (`"...된다"`, `"...면 예외가 발생한다"` 형태)
- [ ] given / when / then 주석으로 단계 구분?
- [ ] 정상 케이스 + 최소 2개 이상의 경계값?
- [ ] 응답 바디 필드를 구체적으로 검증 (단순 statusCode 만 X)?
- [ ] 인증 필요 API 는 JWT 헤더 포함?
- [ ] 픽스처가 한국어 의도가 드러나는 이름? (`모집중인_동아리`, `삭제된_동아리`)

## 금지

- `@DisplayName("findClubs - 필터 동작")` 처럼 메서드명 재진술
- 응답을 `print()` 만 하고 검증 누락
- DB 정리 누락 → 테스트 간 상태 오염
- Mock 만 사용하고 실제 HTTP/DB 경로 검증 누락 (RestAssured 통합 테스트의 목적)