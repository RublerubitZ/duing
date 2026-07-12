# 지원 사전 검증 & 지원서 질문 유형 확장 설계

- 날짜: 2026-07-08
- 상태: 승인 대기
- 범위: backend(모집·지원·임시저장 도메인) + frontend(동아리 상세·지원 작성·리더 모집 폼)

## 배경 / 문제

1. **사전 검증 부재** — 지원 가능 여부(회원 여부·중복 지원·마감 등) 검증이 전부 제출 시점에만 수행된다. 사용자가 지원서를 다 쓴 뒤에야 "이미 지원한 모집 공고입니다" 같은 안내를 받는다.
2. **질문 유형 단일** — 지원서 질문이 주관식 하나뿐이다. 질문·답변이 jsonb `List<String>`에 위치 기반으로 저장되어 유형·필수 여부·선택지를 표현할 수 없다.

현재 구조의 핵심 사실:

- 질문: `recruitment_form.questions` (jsonb `List<String>`), 답변: `application.answers` (jsonb `List<String>`), 인덱스로 대응
- 임시저장: `application_draft.answers` (jsonb `List<DraftAnswer(Long questionId, String value)>` record) — jsonb record 리스트 전례
- 제출 검증 7단계가 `GeneralApplicationService.submit()` 안에 순차 배치
- 보호 장치: #603(지원자 존재 시 질문 변경 차단), #604(질문 50개·500자 / 답변 50개·2000자), 운영진 열람 `min(질문,답변)` 방어 페어링
- PII 파기 잡은 `answers = '[]'::jsonb`로 스크럽 — 새 구조와 호환(빈 배열 = 빈 객체 리스트)

## 목표

1. 지원하기 버튼 클릭 즉시 서버 사전 검증(eligibility) → 통과 시에만 지원서 페이지 이동, 제출 시 최종 검증 유지(2단계 가드)
2. 질문 유형 3종(주관식 TEXT / 단일 선택 SINGLE_CHOICE / 복수 선택 MULTIPLE_CHOICE) + 질문별 필수/선택 설정
3. 기존 API·기존 데이터 완전 호환(신·구 DTO 병행), 배포 시차에 안전

## Out of Scope

- "기타(직접입력)" 선택지
- 복수 선택 최소/최대 개수 제한
- 선택지별 통계·분석
- 내 지원서/운영진 열람 응답의 구조화 답변 노출(표시 문자열 유지)
- 지원하기 버튼의 로드 시점 사전 비활성화(클릭 시점 검증만)
- 선택지 순서 변경(드래그·화살표) UI — 입력 순서 = 표시 순서
- shadcn radio-group/checkbox 신규 설치(네이티브 + Tailwind 유지)
- 제출된 지원서의 답변 수정 기능

---

## 1. 지원 사전 검증 (Eligibility)

### 1.1 API

```
GET /api/v1/recruitments/{recruitmentId}/applications/eligibility
```

- `@PreAuthorize("isAuthenticated()")`, `ApplicationApi` 인터페이스 + `ApplicationController` 구현
- 지원 가능: **200** `ApiResponse<Void>`
- 지원 불가: 기존 submit과 동일한 예외가 그대로 전파 — 동일 상태코드·동일 한국어 메시지
  - 404 모집 없음 / 동아리 비ACTIVE(존재 은닉)
  - 400 마감(`RecruitmentClosedException`) / 외부폼(`ExternalFormSubmitException`)
  - 409 중복 지원(`DuplicateApplicationException`) / 이미 회원(`AlreadyClubMemberException`)
  - 403 운영진 모집 자격 미달(`OfficerMembershipRequiredException`, `IneligibleOfficerApplicantException`)

### 1.2 공용 검증 메서드 (단일 소스)

`GeneralApplicationService`에 가드 체인을 **하나의 메서드로 추출**하고, `checkEligibility()`와 `submit()`은 오직 이 메서드로만 사전 검증한다. 검증 로직이 두 곳에 존재하는 것을 금지한다.

```java
private EligibilityTarget validateEligibility(Long recruitmentId, Long userId) {
    // 1 모집 존재 → 2 동아리 ACTIVE → 3 마감 여부(isEffectivelyOpen)
    // → 4 외부폼 차단 → 5 사용자 존재 → 6 중복 지원 → 7 회원 자격(validateClubMembershipPolicy)
    return new EligibilityTarget(recruitment, user);
}
```

- `EligibilityTarget(Recruitment recruitment, User user)` record — submit이 후속 로직(답변 검증·저장)에 재사용
- `checkEligibility(Long userId, Long recruitmentId)`: readOnly 트랜잭션, 반환값 없이 검증만
- `submit()`: 기존 순서 그대로 이 메서드 호출 후 답변 검증 → 저장 → draft 삭제. **제출 시 최종 검증은 자동 유지**(같은 메서드를 다시 통과하므로 사전 검증~제출 사이의 상태 변화(TOCTOU)는 제출에서 걸러짐)

### 1.3 프론트엔드 플로우

- `useClubApply`(지원 버튼 2곳이 공유): SELF 모집에서 인증된 사용자가 클릭 시
  1. eligibility API 호출(호출 중 버튼 pending — 중복 클릭 방지)
  2. 성공 → `/apply/{recruitmentId}` push
  3. `ApiError` → 기존 `ToastProvider`로 `error.message`(서버 한국어 메시지) 토스트, 이동 없음
- EXTERNAL(외부폼 새 창)·비로그인(`/login?next=...`) 분기는 기존 그대로 — eligibility 호출 없음
- **딥링크 가드**: `/apply/[recruitmentId]` 페이지 진입 시 동일 API 조회(retry 없음). 부적격이면 폼 대신 안내 패널(서버 메시지 + "동아리 페이지로 돌아가기" 링크) 렌더

---

## 2. 질문 유형 확장

### 2.1 데이터 모델 (jsonb 구조 확장)

테이블 추가 없이 기존 jsonb 컬럼의 원소 구조를 확장한다(임시저장 `DraftAnswer` record jsonb와 동일 메커니즘).

**질문** — `recruitment_form.questions`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "text": "관심 분야를 선택해주세요.",
  "type": "MULTIPLE_CHOICE",
  "required": true,
  "choices": [
    { "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "label": "기획" },
    { "id": "8a1d3f21-1b2c-4c3d-9e4f-5a6b7c8d9e0f", "label": "디자인" }
  ]
}
```

```java
// recruitment/entity
public enum QuestionType { TEXT, SINGLE_CHOICE, MULTIPLE_CHOICE }
public record QuestionChoice(String id, String label) {}
public record RecruitmentQuestion(
        String id, String text, QuestionType type, boolean required, List<QuestionChoice> choices) {}
```

- `RecruitmentForm.questions`: `List<String>` → `List<RecruitmentQuestion>` (`@JdbcTypeCode(SqlTypes.JSON)`)
- TEXT 질문은 `choices: []`

**답변** — `application.answers`: 위치 대응을 폐기하고 **questionId 참조**로 전환.

```json
{ "questionId": "550e8400-...", "values": ["7c9e6679-...", "8a1d3f21-..."] }
```

```java
// application/entity
public record ApplicationAnswer(String questionId, List<String> values) {}
```

- `values` 의미(유형별 단일 규약):
  - TEXT → 원소 1개 = 답변 본문(선택 질문 미응답 시 `[]`)
  - SINGLE_CHOICE → 원소 0~1개 = **choiceId**
  - MULTIPLE_CHOICE → 원소 0~n개 = **choiceId** 목록
- 라벨이 아닌 choiceId를 저장하므로 선택지 라벨 오타 수정(지원자 없을 때)에도 답변 참조가 안정적

**임시저장** — `application_draft.answers`: `DraftAnswer(Long questionId, String value)` → `DraftAnswer(String questionId, List<String> values)` (questionId = 질문 UUID, values 의미는 위와 동일). 임시저장은 제출이 아니므로 choices 대조 등 엄격 검증 없이 크기 상한만 적용 — 엔트리 ≤ 50(현행), values 원소 각 ≤ 2000자(현행 value 상한 승계), values 개수 ≤ 20(선택지 상한과 정합).

### 2.2 ID 정책 — 재생성 절대 금지

- 질문 id·선택지 id는 **서버가 생성 시점에 1회만 UUID 발급**한다. 클라이언트가 보낸 id는 신규 생성 시 무시한다.
- **수정 시 서버는 id를 절대 재생성하지 않는다.** 클라이언트(리더 수정 폼)는 상세 응답에서 받은 id를 그대로 왕복(round-trip)시키고, 서버는:
  - `id == null` → 신규 항목으로 간주, 새 UUID 발급
  - `id != null` → 반드시 **현재 폼에 존재하는 질문 id**여야 함(아니면 400). 선택지 id는 반드시 **해당 질문의 현재 선택지 id**여야 함(다른 질문의 선택지 id 포함 시 400)
  - 요청 내 질문 id 중복·선택지 id 중복 → 400
- id가 위치와 독립적이므로 질문 순서 변경(지원자 없을 때)에도 임시저장 답변 매칭이 유지된다.

### 2.3 질문 불변 정책 — 지원자 존재 시 전면 금지

기존 #603 가드를 구조화 질문에 맞게 확장하고 정책을 명문화한다:

> **지원자가 1명이라도 존재하면(활성 지원서 기준) 질문의 추가·삭제·순서 변경·텍스트 변경·타입 변경·필수 여부 변경·선택지 추가/삭제/라벨 변경/순서 변경을 전부 금지한다.** 위반 시 409 `QuestionsNotEditableWithApplicationsException`(기존 예외 재사용).

- 변경 감지 = `List<RecruitmentQuestion>` 전체 구조 동등성 비교(record equals — id·text·type·required·choices의 id/label/순서 포함)
- 동일 구조 재전송은 허용(부분 갱신 페이로드에 질문을 포함해도 무방 — 현행 동작 유지)
- 이 정책이 답변의 questionId·choiceId 참조 무결성을 보장한다. 지원서가 존재하는 한 참조 대상이 사라지거나 의미가 바뀔 수 없다.
- 철회(soft delete)된 지원서만 남은 경우: 활성 지원자 0명이므로 편집 허용(현행 `existsBy...` 시맨틱 유지). 철회된 지원서는 어떤 화면에도 렌더되지 않으므로 dangling 참조가 노출될 경로 없음(방어적으로 미해석 참조는 표시에서 무시).

### 2.4 마이그레이션 — `V78__recruitment_question_types.sql`

> 파일 번호는 구현 시점에 최신 버전(현재 V77) 재확인 후 확정. 기존 파일 수정 금지 원칙 준수.

한 파일에서 3단계 UPDATE(순서 중요 — 답변·임시저장 변환이 1단계에서 발급된 질문 id에 의존):

1. **질문 승격**: `"질문텍스트"` → `{"id": gen_random_uuid(), "text": "질문텍스트", "type": "TEXT", "required": true, "choices": []}` (`jsonb_array_elements_text ... WITH ORDINALITY` + `jsonb_agg ORDER BY ordinality`)
2. **답변 승격**: application × recruitment_form 조인, 같은 인덱스의 질문 id를 참조로 — `"답변"` → `{"questionId": "<questions[i].id>", "values": ["답변"]}`. 질문 수를 초과하는 잉여 답변(과거 폼 편집 잔재)은 `{"questionId": null, "values": [...]}`로 무손실 보존 — 현재도 화면에 노출되지 않는 데이터라 표시 동작 동일
3. **임시저장 승격**: `{"questionId": 0, "value": "..."}` → `{"questionId": "<해당 인덱스 질문 uuid>", "values": ["..."]}`. 질문 범위를 벗어난 인덱스 엔트리는 폐기(FE가 생성하지 않는 형태의 잔재)

- 모든 UPDATE는 soft delete 무관하게 전체 행 대상(삭제된 지원서도 형태 통일 — PII 스크럽 `'[]'` 행은 조건 미충족으로 자연 스킵)
- **병합 전 MCP(개발 DB)에서 변환 SQL 드라이런**으로 실데이터 검증
- 테스트 환경은 Testcontainers가 V1부터 전체 마이그레이션을 실행하므로 스키마 정합은 통합 테스트가 보증

### 2.5 API 계약 — 신·구 DTO 병행 (하위 호환)

| API | Legacy (유지·동작) | New (추가) | 규칙 |
|---|---|---|---|
| 모집 생성 `POST /leader/clubs/{clubId}/recruitments` | `questions: string[]` → TEXT·필수·choices 없음으로 매핑, id 서버 발급 | `questionItems: [{id?, text, type, required, choices: [{id?, label}]}]` | 둘 다 제시 시 400. SELF 모드는 둘 중 하나로 질문 ≥ 1 |
| 모집 수정 `PATCH /leader/recruitments/{recruitmentId}` | `questions: string[]` — 아래 안전 규칙 | `questionItems` — id 왕복, §2.2·§2.3 적용 | 둘 다 제시 시 400. 둘 다 null = 질문 변경 없음 |
| 지원 제출 `POST /recruitments/{recruitmentId}/applications` | `answers: string[]` → 폼 질문에 위치 순 매핑 후 동일 검증(전 질문 TEXT일 때만 통과 가능) | `answerItems: [{questionId, values}]` | 둘 다 제시 시 400, 둘 다 null이면 기존 `@NotNull` 실패와 동일한 400 |
| 임시저장 `PUT /recruitments/{recruitmentId}/draft` | `{questionId: 숫자, value}` — 숫자는 질문 인덱스로 해석해 UUID 치환, `value` → `values` | `{questionId: uuid, values}` | 엔트리별 판별(숫자형=legacy). 저장은 항상 신형 |
| 모집 상세 `GET /recruitments/{recruitmentId}` | `questions: string[]` (텍스트만) 유지 | `questionItems` 필드 추가 | 응답은 추가 확장만 |
| 임시저장 조회 `GET /recruitments/{recruitmentId}/draft` | — | 신형 `{questionId: uuid, values}`로 반환 | 구 FE는 시차 중 프리필만 미동작(§3) |
| 내 지원서 `GET /users/me/applications/{id}` | `questions: string[]` + `answers: string[]` 형태 유지 | 변경 없음 | answers는 표시 문자열(§2.7) |
| 운영진 열람 `GET /leader/applications/{id}` | `QuestionAnswer(question, answer)` 형태 유지 | 변경 없음 | answer는 표시 문자열(§2.7) |

**모집 수정의 legacy `questions` 안전 규칙** (구 리더 FE가 선택형 질문을 TEXT로 덮어쓰는 사고 방지):

1. 텍스트 배열이 현재 질문 텍스트와 순서까지 동일 → **no-op** (id 보존, 기존 "동일 재전송 허용"과 동치)
2. 다르고, 현재 폼에 TEXT·필수 아닌 질문이 하나라도 존재 → **400** ("구 버전 형식으로는 선택형 질문을 수정할 수 없습니다")
3. 다르고, 현재 폼이 전부 TEXT·필수 → 전체 교체(신규 id 발급, §2.3 가드 적용) — 현행 시맨틱 유지

### 2.6 검증 규칙 (프론트·백엔드 동일 정책)

**질문 정의** (생성/수정, Bean Validation + Command compact constructor):

| 항목 | 규칙 | 위반 시 |
|---|---|---|
| 질문 개수 | 1~50개(SELF), #604 유지 | 400 |
| 질문 텍스트 | 비공백, ≤ 500자 | 400 |
| type / required | 필수 값 | 400 |
| TEXT의 choices | 반드시 빈 배열/null | 400 `InvalidQuestionDefinitionException`(신규, RecruitmentException 하위) |
| 선택형의 choices | 2~20개 | 400 상동 |
| 선택지 라벨 | 비공백, ≤ 200자, 같은 질문 내 중복 금지 | 400 상동 |
| id 규칙 | §2.2 (존재하지 않는 id·중복 id·타 질문 선택지 id → 400) | 400 상동 |

**답변** (제출, `validateAnswersAgainstForm` 확장):

| 항목 | 규칙 | 위반 시 |
|---|---|---|
| 엔트리 ↔ 질문 대응 | 폼 질문 id 집합과 **정확히 1:1** (누락·중복·미지 questionId 금지) | 400 `InvalidAnswersException`(기존 재사용) |
| TEXT | values ≤ 1개, 각 ≤ 2000자. **필수면 비공백 1개** | 400 필수 미응답 → `RequiredAnswerMissingException`(신규) |
| SINGLE_CHOICE | values ≤ 1개. **필수면 정확히 1개** | 400 상동 |
| MULTIPLE_CHOICE | values 중복 금지. **필수면 ≥ 1개** | 400 상동 |
| choiceId 소속 | 선택형 values의 각 원소는 **바로 그 질문의 choices에 존재하는 choiceId**여야 함 — 타 질문의 choiceId·미지 id 거부 | 400 `InvalidChoiceSelectionException`(신규) |
| 선택 질문 미응답 | `values: []` 허용 | — |
| 개수 상한 | 엔트리 ≤ 50 (#604 유지) | 400 Bean Validation |

프론트는 제출 전 동일 규칙을 JS로 검증(질문별 인라인 에러)하고, 백엔드는 무조건 재검증한다.

### 2.7 조회·표시 규칙 (id 기반 페어링)

- 위치 기반 `min(questions, answers)` 페어링을 **questionId 매칭**으로 교체
- 표시 문자열 변환: TEXT → `values[0]`(없으면 `""`) / 선택형 → choiceId를 라벨로 해석해 `", "` 조인(미응답 `""`)
- 내 지원서: `questions`(폼 순서 텍스트) + `answers`(같은 순서의 표시 문자열) — 응답 형태 불변
- 운영진 열람: `QuestionAnswer(question, answer)` — 형태 불변. 답변 없는 질문도 빈 answer로 노출(누락 질문을 숨기던 min() 방어보다 정보 우위)
- `questionId: null`(마이그레이션 잉여 답변)·미해석 choiceId는 표시에서 무시(현재도 비노출인 데이터)

### 2.8 프론트엔드

레이어 순서(types → api → hooks → components → page → test) 준수. 신 FE는 항상 신형 필드로 통신한다.

- **`@duing/types`**: `QuestionType`, `RecruitmentQuestionChoice {id, label}`, `RecruitmentQuestionItem {id, text, type, required, choices}`, 페이로드용 `{id?: string|null, ...}` 변형, `SubmitApplicationPayload = { answerItems: {questionId, values: string[]}[] }`, 드래프트 신형. `RecruitmentDetail`에 `questionItems` 추가(기존 `questions` 유지)
- **`@duing/api` client.ts**: `applications.checkEligibility(recruitmentId)` (GET, `jsonVoid`), 기존 함수 페이로드 타입 갱신
- **`@duing/hooks`**: `useCheckEligibilityMutation`(버튼 pending용), `useApplicationEligibilityQuery`(딥링크 가드용, retry 0)
- **`@duing/schemas`**: `createRecruitmentSchema`/`updateRecruitmentSchema`의 질문을 questionItems 구조로 확장 — §2.6 질문 정의 규칙을 Zod refine으로(한국어 메시지)
- **QuestionBuilder(리더)**: 질문 카드마다 텍스트 입력 + 유형 라디오 3개(기존 applicationMode 라디오 패턴) + ☑ 필수(기본 on) + 선택형일 때 선택지 행(라벨 입력·추가·삭제, 최소 2개 힌트). 유형을 선택형→TEXT로 바꾸면 choices는 상태에 유지하되 제출에서 제외(실수 복구 여지), TEXT 저장 시 빈 배열 전송. 기존 질문 편집 시 id 왕복(신규 질문·선택지는 id 없이 전송). React key는 로컬 임시 key 사용(서버 id와 별개)
- **RecruitmentForm**: `questionItems` 상태로 전환, edit 모드 초기값은 `detail.questionItems`(없으면 `questions`를 TEXT·필수로 변환하는 fallback — 구 BE 시차 대비)
- **ApplyAnswersStep(지원자)**: 유형별 렌더
  - TEXT → 기존 textarea 스타일 유지
  - SINGLE_CHOICE → `fieldset` + `legend`(질문 텍스트) + 네이티브 radio(공유 name = questionId, value = choiceId)
  - MULTIPLE_CHOICE → `fieldset` + `legend` + 네이티브 checkbox 그룹
  - 필수 질문은 라벨에 `*`(aria-hidden) + `aria-required`, 선택 질문은 "(선택)" 배지
  - 검증은 JS 통합(체크박스 그룹은 HTML required 표현 불가): 제출 시 §2.6 규칙 위반 질문에 인라인 에러 + `aria-invalid` + `aria-describedby`, 첫 위반 질문으로 포커스 이동
- **ApplyForm**: 답변 상태 `{questionId, values}[]`(질문 id 키), 제출 페이로드 `answerItems`. 임시저장 시드는 questionId 매칭(+ 선택형은 현재 choices에 없는 choiceId 필터링), autosave는 신형 페이로드
- **useClubApply / apply page**: §1.3
- 반응형: 기존 단일 컬럼 폼 유지, 선택지 랩핑. 접근성: fieldset/legend·label 연결·키보드 조작(네이티브 컨트롤이라 기본 보장)

---

## 3. 배포 시차 안전성

| 조합 | 동작 |
|---|---|
| 구 FE + 신 BE | 읽기: `questions` 유지로 정상. 쓰기: legacy 필드 그대로 수용(생성=TEXT 질문, 제출=위치 매핑, draft=인덱스 해석). 선택형 질문이 있는 폼에 구 FE로 제출하면 400(명확한 실패, 데이터 손상 없음). 구 FE의 draft 프리필만 시차 중 미동작(자동저장 자체는 정상) |
| 신 FE + 구 BE | 읽기: `questionItems` 부재 → `questions` fallback(TEXT 렌더). 쓰기: 구 BE는 미지 필드(`questionItems`/`answerItems`) 무시 → 생성은 "질문 최소 1개" 400, 제출은 `@NotNull answers` 400 — 명확한 실패, 손상 없음 |
| 시차 중 선택형 질문 존재 가능성 | 사실상 없음 — 선택형 질문은 신 BE + 신 리더 FE가 모두 배포된 뒤에만 생성 가능 |

배포 순서는 BE 먼저(권장). 어느 순서든 데이터 손상 경로는 없다.

## 4. Legacy DTO 제거 계획 (TODO)

전환 완료 후 제거할 하위 호환 코드. 각 지점에 `// TODO(legacy-questions-v1): <아래 항목> — 제거 이슈 #<번호>` 마커를 남기고, **FE 4개 PR 전부 배포 + 1~2주 안정화 후 별도 이슈/PR로 일괄 제거**한다.

| # | 제거 대상 | 전제 조건 |
|---|---|---|
| 1 | `CreateRecruitmentRequest.questions` / `UpdateRecruitmentRequest.questions` + legacy 매핑·안전 규칙(§2.5) | 신 리더 FE 배포 확인 |
| 2 | `SubmitApplicationRequest.answers`(string[]) + 위치 매핑 | 신 지원 FE 배포 확인 |
| 3 | 임시저장 legacy 해석(숫자 questionId·`value` 필드) | 신 지원 FE 배포 + 기존 draft TTL 경과 |
| 4 | `RecruitmentDetailResponse.questions`(string[]) | FE의 모든 `questions` 소비처가 `questionItems`로 전환 완료 |
| 5 | FE의 `questions` fallback(RecruitmentForm·apply) | 구 BE 소멸(항목 4 이전에 제거 가능) |

내 지원서·운영진 열람의 `questions`/`answers` 표시 문자열 응답은 legacy가 아니라 해당 화면의 정식 계약이므로 제거 대상이 아니다.

## 5. 테스트 계획

**백엔드** (기존 3계층 스타일 준수, 날짜는 상대값):

- Bean Validation 단위: 질문 정의(50개·500자·선택지 2~20·라벨 200자·중복)·답변(50개·2000자) 경계값
- 서비스 단위(Mockito): 공용 eligibility 메서드 7가드 각각의 예외, submit이 동일 메서드를 경유함, 답변 검증 매트릭스(필수/선택 × 3유형 × 정상/누락/미지 id/타 질문 choiceId/중복 choiceId/SINGLE 2개), 질문 정의 검증, legacy 매핑(생성·수정 3규칙·제출 위치 매핑·draft 인덱스 해석), 지원자 존재 시 모든 변경 유형 409·동일 재전송 허용, id 왕복(재생성 금지·미지 id 400)
- 통합(RestAssured + Testcontainers): eligibility 200/404/400/409/403 매트릭스, 신형 questionItems 생성→상세 응답 `questions`+`questionItems` 동시 검증→신형 제출→내 지원서/운영진 열람 표시 문자열, legacy 페이로드 생성·제출 왕복, draft 신·구 페이로드
- 마이그레이션: 개발 DB(MCP) 드라이런으로 실데이터 변환 검증 + 통합 테스트가 전체 마이그레이션 체인 실행

**프론트엔드** (vitest + MSW, React Query 실클라이언트):

- `useClubApply`: eligibility 성공→push, 실패→토스트+미이동, pending 중 재클릭 무시
- apply page: 딥링크 부적격 패널, 유형별 렌더(radio/checkbox/textarea), 필수 미응답 시 인라인 에러+포커스+미제출, 선택 질문 빈 값 제출 허용, 제출 페이로드 `answerItems` 형태 검증, draft 시드(choiceId 필터 포함)
- QuestionBuilder: 유형 전환·선택지 추가/삭제·필수 토글·id 왕복 페이로드
- 기존 테스트 회귀: apply-page·recruitment-form 스위트 갱신

**E2E**: 로컬 BE(bootRun) + FE(:3000)로 리더 질문 3유형 생성 → 지원자 작성(필수 검증 포함) → 제출 → 운영진 열람까지 실브라우저(playwright MCP) 통과. 종료 후 dev 서버 정리.

**품질 게이트**: `./gradlew test`(backend/), `pnpm lint && pnpm test && pnpm build`(frontend/) 통과. 각 PR 전 spec/quality 리뷰 dispatch.

## 6. 리스크 & 확인된 사항

- ✅ PII 파기 잡: `answers = '[]'::jsonb` — 신 구조와 호환 확인 완료
- ✅ jsonb record 리스트: `ApplicationDraft.answers`(record) 전례로 Hibernate 매핑 검증됨
- ⚠️ Fixture Monkey의 중첩 record(List<RecruitmentQuestion> 내 List<QuestionChoice>) 생성 — draft 전례상 가능 전망, 구현 초기에 확인
- ⚠️ 마이그레이션 2단계(답변 승격)는 application 전체 행 UPDATE — 현재 데이터 규모(단일 대학 서비스)에서 무리 없음, 드라이런에서 소요 확인
- ⚠️ `RecruitmentForm.replaceQuestions` 시그니처 변경의 컴파일 파급(서비스·쿼리 DTO·픽스처) — 컴파일러가 전수 노출

## 7. PR 분리 (develop 기준 순차)

| # | 브랜치(예) | 내용 |
|---|---|---|
| 1 | `feat/<이슈>-application-eligibility-api` | BE: eligibility API + 공용 검증 메서드 추출 + 테스트 |
| 2 | `feat/<이슈>-apply-eligibility-guard` | FE: useClubApply 사전 검증 + 딥링크 가드 + 테스트 |
| 3 | `feat/<이슈>-recruitment-question-types-api` | BE: V78 마이그레이션 + 질문/답변 구조 확장 + 신·구 DTO + 검증 + 테스트 |
| 4 | `feat/<이슈>-apply-question-types-ui` | FE: types/api/hooks/schemas + QuestionBuilder + ApplyAnswersStep + 테스트 (공유 패키지가 한 몸이라 통합) |

1↔3은 같은 서비스 파일을 건드리므로 1 머지 후 3 분기. 이 스펙 문서는 PR 1 브랜치에 포함해 커밋한다.
