---
name: flyway-migration
description: Flyway 마이그레이션 파일을 안전하게 추가한다. 버전 번호 자동 채번, 언더스코어 검증, 기존 파일 보호.
---

# flyway-migration — Flyway 마이그레이션 추가

**트리거**: "테이블 추가", "컬럼 추가", "스키마 변경", "DB 변경", `/flyway-migration {설명}`

## 사전 확인

1. 현재 최고 버전 확인:
   ```
   ls src/main/resources/db/migration/ | grep -E '^V[0-9]+__' | sort -V | tail -1
   ```
2. 새 파일 버전 = (현재 최고 버전) + 1
3. 기존 파일은 **절대 수정 금지** — 변경이 필요하면 새 버전 파일만 추가

## 파일명 규칙

`V{버전}__{스네이크케이스_설명}.sql`

- 언더스코어 두 개 (`__`) 필수
- 설명은 동사 + 대상: `create_user_table`, `add_division_column_to_club`, `add_unique_index_application_recruitment_user`
- 예시
  - `V1__create_user_table.sql`
  - `V6__add_division_column_to_club.sql`

## SQL 작성 규칙

- `CREATE TABLE IF NOT EXISTS` 사용 — 재실행 안전성 확보
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
- `CREATE INDEX IF NOT EXISTS`
- 공통 컬럼 패턴:
  ```sql
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
  ```
- FK 는 `REFERENCES` 명시: `club_id BIGINT NOT NULL REFERENCES club(id)`

## 체크리스트

- [ ] 파일명 언더스코어 **두 개**?
- [ ] 버전 번호가 기존 최고 버전보다 정확히 1 큼?
- [ ] 기존 파일을 수정하지 않았는가?
- [ ] `IF NOT EXISTS` 적용?
- [ ] 공통 4컬럼(`id`, `created_at`, `updated_at`, `deleted_at`) 포함? (새 테이블의 경우)
- [ ] FK 컬럼에 `REFERENCES`?

## 금지

- 기존 V 파일 in-place 수정 (체크섬 불일치로 부팅 실패)
- 언더스코어 한 개 (`V1_create_user.sql`) → Flyway 인식 안 됨
- 동일 버전 중복 (`V5__a.sql`, `V5__b.sql`) → 충돌
- `DROP TABLE` 직접 실행 (soft delete 정책 위반) — 정말 필요하면 사용자에게 확인
