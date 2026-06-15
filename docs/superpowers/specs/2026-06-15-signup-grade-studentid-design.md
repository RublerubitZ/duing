# 회원가입 개선 — 학번 8자리·재확인 + 학년 항목 변경 설계

- 날짜: 2026-06-15
- 범위: 회원가입의 (1) 학번 입력을 8자리 숫자로 고정 + 한 번 더 입력해 일치 확인, (2) 학년 선택에서 졸업유예를 빼고 휴학생·졸업생을 추가.

## 결정 사항

- 학번 재확인: **재입력 필드**(학번을 한 번 더 입력 → 일치해야 진행). 학번은 가입 후 수정 불가라 오타를 확실히 차단.
- 학번 자리수: **정확히 8자리 숫자**(대구대 학번).
- 학년: `GRADUATE_DEFERRED(졸업유예)` 제거 → `ON_LEAVE(휴학생)`, `GRADUATED(졸업생)` 추가. **기존 데이터 없음 → 마이그레이션 불필요.**

## 백엔드 (PR 1)

- **`Grade` enum** (`domain/user/entity/Grade.java`): `FRESHMAN/SOPHOMORE/JUNIOR/SENIOR/ON_LEAVE("휴학생")/GRADUATED("졸업생")`. `GRADUATE_DEFERRED` 제거.
- **`SignupRequest.studentId`**: `@Pattern("\\d{7,10}", …)` → `@Pattern("\\d{8}", "학번은 8자리 숫자여야 합니다.")`.
- 학번 재확인은 클라이언트 검증 — 백엔드 페이로드/엔티티 변경 없음. Grade 컬럼은 이미 varchar(20)이라 스키마 변경 없음.
- 테스트: studentId 8자리 통과 / 7·9자리 거부(Bean Validation), 새 Grade 값 매핑.

## 프론트엔드 (PR 2, 백엔드 머지 후)

- **`packages/types` Grade** + `GRADE_DISPLAY_NAME` + `GRADE_OPTIONS`: 졸업유예 제거, 휴학생·졸업생 추가. `GradeSelect`는 옵션 기반이라 자동 반영.
- **`packages/schemas` signupSchema**: studentId `/^\d{7,10}$/` → `/^\d{8}$/`, 메시지 "학번은 8자리 숫자여야 합니다." (`GRADE_VALUES`는 Grade 옵션에서 파생되어 자동 반영)
- **가입 폼**: 학번 입력 **숫자만·최대 8자리**, 그 아래 **"학번 확인" 재입력 필드** — 두 값이 일치하지 않으면 에러 표시 + 다음 단계/제출 차단.
- 테스트: 스키마(8자리 통과 / 7·9자리 실패), 학번 확인 불일치 차단, 학년 옵션에 휴학생·졸업생 노출 + 졸업유예 미노출.

## Out of Scope

- 기존 사용자 학년 일괄 변경(데이터 없음).
- 학번 외 다른 가입 필드 변경, 학번 형식의 학교 시스템 실시간 검증.
