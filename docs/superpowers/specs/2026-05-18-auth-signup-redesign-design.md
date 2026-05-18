# 회원가입 확장 · 로그인 리디자인 설계서

- 작성일: 2026-05-18
- 대상 도메인: User / Auth
- 관련 요구사항: REQUIREMENTS.md §2.1 (User)

## 1. 배경 및 목적

현재 회원가입은 학번·이름·이메일·비밀번호 4개 필드만 받는다. 실제 운영에 필요한 학적 정보(학년·단과대학·전공)·연락처(전화번호)·법적 요구사항(이용약관·개인정보 동의)이 누락되어 있다. 본 변경으로 학생 식별과 법적 동의 이력을 확보하고, 회원가입 폼을 2단계 위저드로 정돈한다. 동시에 로그인 페이지를 회원가입과 같은 카드 레이아웃으로 시각적으로 정렬한다.

## 2. 범위

### 포함
- User 엔티티 5개 컬럼 확장 (`grade`, `college`, `major`, `phone`, `terms_agreed_at`)
- 회원가입 API (`POST /auth/signup`) 요청 바디 확장 및 검증 규칙 추가
- 회원가입 페이지 2단계 위저드 (`/signup`)
- 로그인 페이지 UI 리디자인 (`/login`) 및 `(auth)` 공유 레이아웃

### 제외 (백로그)
- 이메일 인증 메일 발송 / SMTP 인프라
- 아이디 · 비밀번호 찾기
- 회원 정보 수정 페이지
- 운영자용 임시 비밀번호 발급 메뉴

## 3. 도메인 모델

### 3.1 새 Enum

`com.duing.domain.user.entity.Grade`

| Enum 키 | 표시명 |
|---|---|
| `FRESHMAN` | 1학년 |
| `SOPHOMORE` | 2학년 |
| `JUNIOR` | 3학년 |
| `SENIOR` | 4학년 |
| `GRADUATE_DEFERRED` | 졸업유예 |

`com.duing.domain.user.entity.College` — 11개 단과대학 + 3개 단독 학부를 하나의 enum 에 통합.

| Enum 키 | 표시명 |
|---|---|
| `PUBLIC_LEADERS` | 공공인재대학 |
| `GLOBAL_BUSINESS` | 글로벌경영대학 |
| `SOCIAL_SCIENCE` | 사회과학대학 |
| `HEALTH_BIO` | 보건바이오대학 |
| `IT_ENGINEERING` | IT·공과대학 |
| `DESIGN_ART` | 디자인예술대학 |
| `EDUCATION` | 사범대학 |
| `REHABILITATION` | 재활과학대학 |
| `NURSING` | 간호대학 |
| `GLOCAL_LIFE` | 글로컬라이프대학 |
| `INTERNATIONAL` | 국제대학 |
| `SPORTS_LEISURE` | 체육레저학부 |
| `CULTURE_CONTENTS` | 문화콘텐츠학부 |
| `FREE_MAJOR` | 자유전공학부 |

각 enum 에 `displayName()` 메서드를 두어 한글 표시명을 enum 자체에서 조회한다. 프론트는 enum 키만 송수신하고 표시명 매핑은 `packages/types/src/user.ts` 의 동일한 dictionary 에서 가져온다.

### 3.2 User 엔티티 확장

신규 컬럼 5개를 `users` 테이블과 `User` 엔티티에 추가한다.

| 컬럼 | 타입 | 제약 |
|---|---|---|
| `grade` | `VARCHAR(20)` | NOT NULL · enum |
| `college` | `VARCHAR(40)` | NOT NULL · enum |
| `major` | `VARCHAR(50)` | NOT NULL |
| `phone` | `VARCHAR(13)` | NOT NULL · CHECK 정규식 · UNIQUE(soft delete 제외) |
| `terms_agreed_at` | `TIMESTAMP` | NOT NULL |

`User.create(...)` 정적 팩토리 시그니처에 5개 인자를 추가한다.

### 3.3 약관 동의 저장 방식

이용약관 동의와 개인정보 수집·이용 동의는 회원가입 시점에 모두 필수이며, 두 동의가 모두 true 일 때만 가입이 성립한다. 별도 이력 테이블은 두지 않고 동의 시각만 `users.terms_agreed_at` 한 컬럼에 저장한다. 약관 버전 추적이 필요해지면 `terms_agreements` 테이블로 분리하는 후속 변경을 둔다.

## 4. 마이그레이션

`backend/src/main/resources/db/migration/Vxxx__add_user_profile_columns.sql`

```sql
ALTER TABLE users
  ADD COLUMN grade            VARCHAR(20)  NOT NULL,
  ADD COLUMN college          VARCHAR(40)  NOT NULL,
  ADD COLUMN major            VARCHAR(50)  NOT NULL,
  ADD COLUMN phone            VARCHAR(13)  NOT NULL,
  ADD COLUMN terms_agreed_at  TIMESTAMP    NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_phone_format_chk
  CHECK (phone ~ '^010-[0-9]{4}-[0-9]{4}$');

CREATE UNIQUE INDEX ux_users_phone ON users (phone) WHERE deleted_at IS NULL;
```

운영 데이터에 기존 row 가 존재할 가능성이 있다면 NOT NULL 추가 전에 backfill 단계를 두어야 하지만, 본 변경 시점에는 develop 단계 테스트 계정만 존재한다고 가정한다. 운영 배포 직전 별도 backfill 마이그레이션을 추가한다.

## 5. API 계약

### 5.1 `POST /auth/signup` 요청 바디

```json
{
  "studentId": "20231234",
  "name": "홍길동",
  "email": "hong@daegu.ac.kr",
  "password": "Abcd1234!",
  "grade": "JUNIOR",
  "college": "IT_ENGINEERING",
  "major": "컴퓨터정보공학부",
  "phone": "010-1234-5678",
  "termsOfServiceAgreed": true,
  "privacyPolicyAgreed": true
}
```

### 5.2 응답

| 코드 | 본문 |
|---|---|
| 201 | `ApiResponse<Long>` — 생성된 userId |
| 400 | 입력 검증 실패 (필드별 메시지) |
| 409 | 중복 이메일 / 중복 학번 / 중복 전화번호 |

새 도메인 예외 `UserException.PhoneAlreadyExistsException` 을 추가한다.

### 5.3 검증 규칙

| 필드 | 규칙 (Zod · Bean Validation 공통) |
|---|---|
| `studentId` | `^\d{7,10}$` |
| `name` | 1~50자, 공백 trim |
| `email` | `^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*daegu\.ac\.kr$` |
| `password` | 8~20자 + 영문 / 숫자 / 특수문자(``!@#$%^&*()_+-=[]{};':",./<>?``) 중 **2종 이상** |
| `grade` | enum 값 일치 |
| `college` | enum 값 일치 |
| `major` | 1~50자 |
| `phone` | `^010-\d{4}-\d{4}$` |
| `termsOfServiceAgreed` | `@AssertTrue` |
| `privacyPolicyAgreed` | `@AssertTrue` |

비밀번호 확인(`passwordConfirm`)은 프론트 폼에서만 검증하고 API 로는 전송하지 않는다.

### 5.4 로그인 API

`POST /auth/login` 의 요청·응답 스펙 변경 없음.

## 6. 프론트엔드

### 6.1 회원가입 위저드 (`/signup`)

```
app/(auth)/signup/
├── page.tsx                    Client wrapper (step state, useReducer)
├── _components/
│   ├── SignupStepAccount.tsx   1단계: 이메일·비밀번호·비밀번호 확인
│   ├── SignupStepProfile.tsx   2단계: 이름·학번·학년·단과·전공·전화·약관
│   ├── CollegeSelect.tsx       14개 옵션 select (College displayName 매핑 사용)
│   ├── GradeSelect.tsx         5개 옵션 select
│   ├── PhoneInput.tsx          입력 중 자동 하이픈 삽입 (XXX-XXXX-XXXX)
│   └── TermsAgreement.tsx      '모두 동의' 토글 + 개별 체크박스 2개
└── _lib/
    └── signup-state.ts         useReducer state·action 타입 정의
```

단계 전환은 URL 분기 없이 step state 로만 처리한다. 새로고침 시 1단계로 리셋한다. 1단계 "다음" 버튼은 step1 필드만 `signupSchema.pick({...}).safeParse` 로 검증 후 통과 시 step2 로 이동한다. step2 "회원가입" 버튼은 전체 스키마로 검증 후 `useSignupMutation` 을 호출하고, 성공 시 `/login?next=/me` 로 리다이렉트한다 (현 동작 유지).

상단에는 `1 — 2` 형태 step indicator 를 둔다. 단계 전환 시 첫 입력 필드에 `autofocus` 를 부여하고, 에러 메시지는 `aria-live="polite"` 컨테이너에 렌더한다.

### 6.2 로그인 페이지 (`/login`) 리디자인

기능 로직(`useLoginMutation`, 리다이렉트, 에러 처리)은 그대로 두고 시각적 마크업·스타일만 교체한다.

- `(auth)/layout.tsx` 신규: 회원가입·로그인이 공유하는 중앙 정렬 카드 컨테이너 + 브랜드 헤더(로고 · "대구대학교 동아리 통합 플랫폼" 한 줄).
- 이메일 input: `type="email"`, `autocomplete="username"`.
- 비밀번호 input: 우측 표시/숨김 토글 아이콘 (inline SVG).
- 에러: 401 시 "이메일 또는 비밀번호가 올바르지 않습니다" 단일 메시지를 form 상단 배너로 노출. 어느 필드가 틀렸는지는 노출하지 않는다.
- 로딩: 버튼 안 스피너 + disabled, 텍스트는 "로그인 중…".
- 푸터: "아직 회원이 아니신가요? 회원가입" 한 줄. 아이디 / 비밀번호 찾기 링크는 배치하지 않는다.

### 6.3 packages 변경

| 패키지 | 변경 |
|---|---|
| `packages/types/src/user.ts` | `Grade`, `College` union 타입 + 표시명 매핑 dictionary export |
| `packages/schemas/src/signup.ts` | 9개 필드 + 동의 2개로 확장. PW 강도·전화번호·이메일 도메인 regex 검증 |
| `packages/schemas/src/password.ts` | PW 강도 함수 단일 정의 (signup 등 다수에서 import) |
| `packages/api/src/client.ts` | `signup()` 페이로드 타입 갱신 (엔드포인트 동일) |
| `packages/hooks/src/useSignupMutation.ts` | 시그니처 자동 따라감, 로직 변경 없음 |

## 7. 테스트

### 7.1 백엔드 (`UserAuthAcceptanceTest` 확장)

- 신규 필드를 모두 포함한 정상 가입 → 201, userId 반환, DB 에 `terms_agreed_at` 기록
- 약관 동의 중 하나라도 false → 400
- 전화번호 형식 오류 (예: `01012345678`) → 400
- 동일 전화번호로 재가입 → 409
- 비밀번호가 영문만 / 숫자만으로 구성된 경우 → 400
- 단과대학 enum 외 값 → 400

### 7.2 프론트엔드 (`apps/web/test/(auth)/signup.test.tsx`)

- 1단계에서 비밀번호와 비밀번호 확인 불일치 시 "다음" 버튼이 disabled / 에러 메시지 표시
- 2단계 약관 두 개 중 하나라도 미동의면 제출 버튼 disabled
- "모두 동의" 토글이 두 체크박스 상태를 일괄 on/off
- `PhoneInput` 에 `01012345678` 입력 시 자동으로 `010-1234-5678` 로 포맷팅

로그인 페이지는 로직 변경이 없으므로 기존 테스트가 그대로 통과해야 한다 (회귀 테스트 역할).

## 8. 작업 분할 (브랜치 = PR 1개 단위)

1. **`feat/xx-user-profile-fields` (backend)** — Flyway 마이그레이션, Grade · College enum, User 엔티티 확장, `SignupRequest` 확장, 서비스 분기, `PhoneAlreadyExistsException`, 인수 테스트 확장.
2. **`feat/xx-signup-wizard` (frontend)** — `packages/types`·`packages/schemas`·`packages/api` 갱신, `(auth)/signup` 2단계 위저드 구현, 단위 테스트. 백엔드 PR 머지 후 시작.
3. **`feat/xx-login-redesign` (frontend)** — `(auth)/layout.tsx` 신규, `(auth)/login/page.tsx` 마크업 교체. 위저드 PR 머지 후 시작.

각 PR 은 lint · typecheck · build · test CI 통과 후 develop 으로 머지한다.

## 9. 결정 사항 요약

| 결정 항목 | 결과 |
|---|---|
| 단과대학 · 단독 학부 모델링 | 단일 `College` enum 14개 |
| 학년 옵션 | 1~4학년 + 졸업유예 (5개) |
| 약관 구성 | 이용약관 · 개인정보 분리 체크박스, 모두 필수, 저장은 단일 시각 |
| 전화번호 형식 | `010-XXXX-XXXX` 강제 |
| 비밀번호 강도 | 8~20자 + 영/숫/특 중 2종 이상 |
| 비밀번호 확인 검증 위치 | 프론트 폼에서만 |
| 이메일 인증 메일 | 본 범위 제외 |
| 회원가입 UI | 2단계 위저드 |
| 로그인 UI | 카드 레이아웃으로 리디자인 (기능 변경 없음) |
| 아이디 · 비밀번호 찾기 | 본 범위 제외 |
| 새 필드 저장 위치 | `users` 테이블에 직접 컬럼 추가 |
