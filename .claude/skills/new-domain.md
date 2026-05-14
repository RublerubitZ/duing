---
name: new-domain
description: Du-ing 백엔드에 새 도메인을 추가한다. Flyway 마이그레이션부터 엔티티·리포지토리·예외·픽스처까지 일관된 순서로 스캐폴딩한다.
---

# new-domain — 도메인 스캐폴딩

**트리거**: "도메인 추가", "새 엔티티", "테이블 추가", `/new-domain {도메인명}`

## 사전 확인
- 도메인명은 단수형 영문 소문자 (`club`, `recruitment`, `application`). 패키지/테이블명에 그대로 쓰인다.
- 기존 `domain/{x}/` 와 충돌하지 않는지 확인.

## 실행 순서

1. **Flyway 마이그레이션**
   `src/main/resources/db/migration/V{현재최대+1}__create_{도메인}_table.sql`
   - 언더스코어 두 개 (`__`) 필수
   - `CREATE TABLE IF NOT EXISTS` 사용
   - 공통 컬럼: `id BIGSERIAL PK`, `created_at TIMESTAMP NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMP NOT NULL DEFAULT NOW()`, `deleted_at TIMESTAMP`

2. **엔티티**
   `domain/{도메인}/entity/{Domain}.java`
   - `extends BaseEntity`
   - `@Entity`, `@Table(name = "{snake_case}")`
   - `@SQLDelete(sql = "UPDATE {table} SET deleted_at = NOW() WHERE id = ?")`
   - `@SQLRestriction("deleted_at IS NULL")`
   - `@Getter`, `@NoArgsConstructor(access = AccessLevel.PROTECTED)`
   - 생성자에 `@Builder`, `private` 접근자
   - 모든 연관관계는 `FetchType.LAZY`

3. **Enum** (필요 시)
   `domain/{도메인}/entity/{Domain}Status.java` 등 — 엔티티와 같은 `entity/` 패키지에 위치.

4. **Repository**
   - 기본: `domain/{도메인}/repository/{Domain}Repository.java` — `extends JpaRepository<{Domain}, Long>`
   - 동적 조건 예상 시: `{Domain}RepositoryCustom` 인터페이스 + `{Domain}RepositoryImpl` (QueryDSL) 추가
     - `{Domain}Repository` 가 `{Domain}RepositoryCustom` 도 함께 `extends`

5. **예외 클래스**
   `domain/{도메인}/exception/{Domain}Exception.java`
   ```
   public class {Domain}Exception extends ApplicationException {
       protected {Domain}Exception(String message, HttpStatus status) { super(message, status); }
       public static class {Domain}NotFoundException extends {Domain}Exception {
           private static final String MESSAGE = "{도메인 한국어명}을(를) 찾을 수 없습니다.";
           public {Domain}NotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
       }
   }
   ```

6. **테스트 픽스처**
   `src/test/java/com/duing/common/fixture/{Domain}Fixture.java`
   - 한국어 메서드명으로 케이스를 표현 (예: `모집중인_동아리()`, `삭제된_동아리()`)
   - Fixture Monkey 또는 직접 빌더 사용

## 체크리스트
- [ ] Flyway 파일명 언더스코어 두 개?
- [ ] 엔티티 `BaseEntity` 상속 + soft delete 어노테이션 2개?
- [ ] Enum 이 `entity/` 패키지에 위치?
- [ ] `{Domain}Exception` + `NotFoundException` 최소 1개 생성?
- [ ] Fixture 추가?

## 금지
- 기존 Flyway 파일 수정 (새 버전 파일만 추가)
- 엔티티에서 `@OneToMany(fetch = EAGER)` 등 즉시 로딩
- Enum 을 `dto/` 패키지에 두기
