# PR-3: 지원서 질문 유형 확장 API (BE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질문을 `{id(UUID), text, type, required, choices[{id, label}]}` 구조로, 답변을 `{questionId, values}` (선택형은 choiceId 저장) 구조로 확장하고, 신·구 DTO 를 병행 지원하며, 기존 데이터를 무손실 마이그레이션한다.

**Architecture:** 스펙 §2 전체. 테이블 추가 없이 jsonb 원소 구조만 승격(V78, 3단계 UPDATE). 엔티티는 `List<String>` → record 리스트(`RecruitmentQuestion`/`ApplicationAnswer`/`DraftAnswer`)로 스왑 — `ApplicationDraft.DraftAnswer` record jsonb 전례와 동일 메커니즘. 위치 페어링을 questionId 참조로 전환. id 는 서버가 1회 발급·수정 시 절대 재생성 금지(클라이언트 왕복). 지원자 존재 시 질문의 모든 변경 금지(#603 확장, record equals 비교). Legacy 필드(`questions: string[]`, `answers: string[]`, draft 숫자 인덱스)는 수용·매핑하고 `TODO(legacy-questions-v1)` 마커를 남긴다.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Flyway / Hibernate 6 jsonb / RestAssured + Testcontainers / Mockito

**전제:** PR-1 (`feat/application-eligibility-api`) 머지 후 분기 — `validateEligibility` 추출이 선행돼 있다.

**사전 확인된 사실 (정찰):**
- 최신 마이그레이션 **V77** (`V77__create_federation_faq_search_miss.sql`) → 새 파일은 V78. **작업 시점에 `ls backend/src/main/resources/db/migration/ | sort -V | tail -3` 으로 재확인**
- `RecruitmentForm.questions`·`Application.answers` 는 `@JdbcTypeCode(SqlTypes.JSON) List<String>`, `ApplicationDraft.answers` 는 `List<DraftAnswer(Long questionId, String value)>` record — record jsonb 전례 있음
- 질문 관련 검증 현행: 질문 50개·500자·NotBlank(요청 DTO), SELF≥1/EXTERNAL=0(`CreateRecruitmentCommand` compact ctor), 답변 50개·2000자(요청 DTO), 개수 일치(`validateAnswersAgainstForm`)
- #603 가드: `GeneralRecruitmentService.update` L134-153 — `questionsChanged && count>0 → QuestionsNotEditableWithApplicationsException(409)`, 동일 재전송 허용
- 운영진 페어링: `ApplicantDetailQuery.buildPairedAnswers` — `Math.min(q,a)` 위치 매핑 → id 매핑으로 교체 대상
- 내 지원서: `MyApplicationDetailQuery.fromAll` — questions/answers 두 리스트 (형태 유지, 값 파생 방식만 교체)
- 임시저장: `GeneralApplicationDraftService.upsert` 가 recruitment 를 이미 로드 — 인덱스→UUID 해석을 여기서 수행 가능. `UpsertDraftRequest.DraftAnswerPayload(Long questionId, String value)`, `UpsertDraftCommand` 는 entity record 를 직접 사용 중 → command 전용 record 로 분리 필요
- PII 파기 잡: `ApplicationRepository.scrubExpiredApplicationAnswers` = `SET answers = '[]'::jsonb` — 새 구조와 호환, **변경 불필요** (스펙 §6 확인 완료)
- `gen_random_uuid()` 는 PG13+ 내장 — Testcontainers·Supabase 모두 충족
- `Recruitment.update(command)` 가 `command.questions()` 로 폼을 교체 — 시그니처를 `update(command, resolvedQuestions)` 로 변경 대상
- 커밋 #604 의 null 정규화(`Application.submit` 의 `replaceAll(null→"")`)와 그 테스트 — record 정규화로 이전하며 테스트 의도 보존 필요

**리뷰 파이프라인 (task 마다):** implementer → spec reviewer → duing-code-reviewer → codex:review. **Migration·데이터 무결성·API contract 대상이므로 마지막에 브랜치 adversarial 리뷰 1회 필수.**

**Out of Scope:** FE(PR-4), 기타(직접입력)·선택 개수 제한·통계, 읽기 API 의 구조화 답변 노출, gen:api 재생성(types 수동 유지가 SoT).

---

## Task 0: 브랜치 생성

- [ ] `git checkout develop && git pull && git checkout -b feat/recruitment-question-types-api`

---

## Task 1: V78 마이그레이션 + 엔티티 구조 스왑 (동작 동등성 유지)

이 태스크가 끝나면 **저장 구조만 바뀌고 API 동작은 완전히 동일**해야 한다(요청·응답 모두 legacy 형태 그대로). 기존 테스트 스위트 green 이 완료 조건.

**Files:**
- Create: `backend/src/main/resources/db/migration/V78__recruitment_question_types.sql`
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/QuestionType.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/QuestionChoice.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/entity/RecruitmentQuestion.java`
- Create: `backend/src/main/java/com/duing/domain/application/entity/ApplicationAnswer.java`
- Modify: `RecruitmentForm.java`, `Application.java`, `ApplicationDraft.java` (record 스왑)
- Modify: `CreateRecruitmentRequest.java`(toCommand 매핑), `CreateRecruitmentCommand.java`, `UpdateRecruitmentCommand.java`, `Recruitment.java`(update 시그니처), `GeneralRecruitmentService.java`(update·buildAndPersist), `RecruitmentException.java`(InvalidQuestionDefinitionException 추가), `RecruitmentDetailQuery.java`, `MyApplicationDetailQuery.java`, `ApplicantDetailQuery.java`, `SubmitApplicationCommand`·`GeneralApplicationService.java`(submit 답변 해석), draft 의 request/command/query/response 및 `GeneralApplicationDraftService.java`
- Modify: 컴파일이 깨지는 모든 테스트·픽스처 (`common/fixture/` 포함) — 의도 보존 어댑트
- Create(Test): `backend/src/test/java/com/duing/domain/recruitment/entity/RecruitmentQuestionTest.java`

- [ ] **Step 1: 마이그레이션 작성** — `V78__recruitment_question_types.sql`:

```sql
-- 질문/답변/임시저장 jsonb 를 구조화 스키마로 승격 (스펙 §2.1·§2.4).
-- 1) 질문: ["질문", ...] → [{"id": uuid, "text", "type": "TEXT", "required": true, "choices": []}, ...]
--    이미 객체 배열인 행(재실행·부분 적용 방어)은 bool_and 조건이 false 가 되어 건드리지 않는다.
UPDATE recruitment_form
SET questions = COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', gen_random_uuid()::text,
                        'text', legacy_question.question_text,
                        'type', 'TEXT',
                        'required', true,
                        'choices', '[]'::jsonb)
                    ORDER BY legacy_question.position)
           FROM jsonb_array_elements_text(questions)
                WITH ORDINALITY AS legacy_question(question_text, position)),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_typeof(question_element) = 'string')
         FROM jsonb_array_elements(questions) AS question_element) IS NOT FALSE;

-- 2) 답변: ["답변", ...] → [{"questionId": <같은 위치 질문의 id | null>, "values": ["답변"]}, ...]
--    질문 수를 초과하는 잉여 답변은 questionId=null 로 무손실 보존(현재도 화면 비노출 데이터).
--    soft delete 된 지원서·폼도 형태를 통일한다(폼 유니크는 recruitment_id 전체 유니크라 행이 1개뿐).
--    과거 null 원소는 빈 문자열로 정규화(#604 이전 데이터 방어). PII 스크럽된 '[]' 행은 자연 스킵.
UPDATE application
SET answers = COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object(
                        'questionId', matched_question.question_id,
                        'values', jsonb_build_array(COALESCE(legacy_answer.answer_text, '')))
                    ORDER BY legacy_answer.position)
           FROM jsonb_array_elements_text(application.answers)
                WITH ORDINALITY AS legacy_answer(answer_text, position)
           LEFT JOIN LATERAL (
               SELECT question_slot.question_element ->> 'id' AS question_id
                 FROM recruitment_form form,
                      jsonb_array_elements(form.questions)
                      WITH ORDINALITY AS question_slot(question_element, question_position)
                WHERE form.recruitment_id = application.recruitment_id
                  AND question_slot.question_position = legacy_answer.position
           ) AS matched_question ON true),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_typeof(answer_element) IN ('string', 'null'))
         FROM jsonb_array_elements(application.answers) AS answer_element) IS NOT FALSE;

-- 3) 임시저장: [{"questionId": 0, "value": "..."}] → [{"questionId": "<uuid>", "values": ["..."]}]
--    질문 범위를 벗어난 인덱스 엔트리는 폐기(FE 가 생성하지 않는 잔재), value 누락은 [] 로.
UPDATE application_draft
SET answers = COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object(
                        'questionId', question_slot.question_element ->> 'id',
                        'values', CASE
                                      WHEN legacy_entry.entry -> 'value' IS NULL
                                           OR jsonb_typeof(legacy_entry.entry -> 'value') = 'null'
                                          THEN '[]'::jsonb
                                      ELSE jsonb_build_array(legacy_entry.entry -> 'value')
                                  END)
                    ORDER BY legacy_entry.position)
           FROM jsonb_array_elements(application_draft.answers)
                WITH ORDINALITY AS legacy_entry(entry, position)
           JOIN recruitment_form form
             ON form.recruitment_id = application_draft.recruitment_id
           JOIN LATERAL jsonb_array_elements(form.questions)
                WITH ORDINALITY AS question_slot(question_element, question_position)
             ON question_slot.question_position = (legacy_entry.entry ->> 'questionId')::bigint + 1
          WHERE jsonb_typeof(legacy_entry.entry -> 'questionId') = 'number'),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_typeof(draft_entry -> 'questionId') = 'number')
         FROM jsonb_array_elements(answers) AS draft_entry) IS NOT FALSE;
```

- [ ] **Step 2: 엔티티 record 작성**

`QuestionType.java`:

```java
package com.duing.domain.recruitment.entity;

public enum QuestionType { TEXT, SINGLE_CHOICE, MULTIPLE_CHOICE }
```

`QuestionChoice.java`:

```java
package com.duing.domain.recruitment.entity;

import java.util.UUID;

/** 객관식 선택지. id 는 생성 시 1회 발급되며 수정 시 재생성하지 않는다 (스펙 §2.2). */
public record QuestionChoice(String id, String label) {

    public static QuestionChoice create(String label) {
        return new QuestionChoice(UUID.randomUUID().toString(), label);
    }
}
```

`RecruitmentQuestion.java`:

```java
package com.duing.domain.recruitment.entity;

import com.duing.domain.recruitment.exception.RecruitmentException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 지원서 질문(jsonb 원소). id 는 서버가 생성 시 1회 발급하고 수정 시 절대 재생성하지 않는다 —
 * 답변(ApplicationAnswer.questionId)·임시저장이 위치가 아닌 id 로 질문을 참조한다 (스펙 §2.1·§2.2).
 */
public record RecruitmentQuestion(
        String id, String text, QuestionType type, boolean required, List<QuestionChoice> choices) {

    public RecruitmentQuestion {
        choices = choices == null ? List.of() : List.copyOf(choices);
    }

    /** legacy string 질문 매핑 — 기존과 동일하게 주관식·필수로 승격한다 (스펙 §2.5). */
    public static RecruitmentQuestion createText(String text) {
        return new RecruitmentQuestion(UUID.randomUUID().toString(), text, QuestionType.TEXT, true, List.of());
    }

    public static RecruitmentQuestion create(String text, QuestionType type, boolean required,
                                             List<QuestionChoice> choices) {
        return new RecruitmentQuestion(UUID.randomUUID().toString(), text, type, required, choices);
    }

    /**
     * 조회 응답의 표시 문자열 — TEXT 는 본문, 선택형은 choiceId 를 라벨로 해석해 ", " 조인.
     * 미해석 choiceId 는 무시한다(지원자 존재 시 질문 불변 정책상 발생 불가 경로의 방어, 스펙 §2.7).
     */
    public String formatAnswerValues(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        if (type == QuestionType.TEXT) {
            return values.get(0);
        }
        Map<String, String> labelByChoiceId = choices.stream()
                .collect(Collectors.toMap(QuestionChoice::id, QuestionChoice::label));
        return values.stream()
                .map(labelByChoiceId::get)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(", "));
    }

    /**
     * 질문 정의의 유형별 의미 검증 (스펙 §2.6). 필드 형식(길이·개수)은 요청 DTO Bean Validation 담당.
     */
    public static void validateDefinitions(List<RecruitmentQuestion> questions) {
        Set<String> questionIds = new HashSet<>();
        for (RecruitmentQuestion question : questions) {
            if (!questionIds.add(question.id())) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("질문 id 가 중복되었습니다.");
            }
            if (question.type() == QuestionType.TEXT) {
                if (!question.choices().isEmpty()) {
                    throw new RecruitmentException.InvalidQuestionDefinitionException(
                            "주관식 질문에는 선택지를 둘 수 없습니다.");
                }
                continue;
            }
            if (question.choices().size() < 2) {
                throw new RecruitmentException.InvalidQuestionDefinitionException(
                        "선택형 질문은 선택지를 2개 이상 등록해야 합니다.");
            }
            Set<String> choiceIds = question.choices().stream().map(QuestionChoice::id)
                    .collect(Collectors.toSet());
            if (choiceIds.size() != question.choices().size()) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("선택지 id 가 중복되었습니다.");
            }
            Set<String> labels = question.choices().stream().map(choice -> choice.label().strip())
                    .collect(Collectors.toSet());
            if (labels.size() != question.choices().size()) {
                throw new RecruitmentException.InvalidQuestionDefinitionException(
                        "같은 질문 안에서 선택지 내용이 중복될 수 없습니다.");
            }
        }
    }
}
```

`ApplicationAnswer.java`:

```java
package com.duing.domain.application.entity;

import java.util.ArrayList;
import java.util.List;

/**
 * 제출된 답변(jsonb 원소). 위치가 아닌 questionId 로 질문을 참조한다.
 * values 의미: TEXT=본문 1개(무응답 시 빈), SINGLE_CHOICE=choiceId 0~1개, MULTIPLE_CHOICE=choiceId 목록.
 * questionId=null 은 V78 마이그레이션의 잉여 답변 보존값으로만 존재하며 표시에서 무시된다 (스펙 §2.4·§2.7).
 */
public record ApplicationAnswer(String questionId, List<String> values) {

    public ApplicationAnswer {
        // null 원소는 빈 문자열(무응답)로 정규화 — 기존 Application.submit 의 #604 정규화를 record 로 이전.
        List<String> sanitized = values == null ? new ArrayList<>() : new ArrayList<>(values);
        sanitized.replaceAll(value -> value == null ? "" : value);
        values = List.copyOf(sanitized);
    }
}
```

`RecruitmentForm.java`: `List<String> questions` → `List<RecruitmentQuestion> questions` (필드·builder·`create`·`getQuestions`·`replaceQuestions` 전부 타입 교체 — 로직 동일). `Application.java`: `List<String> answers` → `List<ApplicationAnswer> answers`, `submit` 은:

```java
    public static Application submit(Recruitment recruitment, User user, List<ApplicationAnswer> answers) {
        // 원소 null 정규화는 ApplicationAnswer 의 compact constructor 가 담당한다.
        List<ApplicationAnswer> sanitized = answers == null
                ? List.of()
                : answers.stream().filter(Objects::nonNull).toList();
        return Application.builder()
                .recruitment(recruitment).user(user)
                .answers(new ArrayList<>(sanitized))
                .status(ApplicationStatus.SUBMITTED)
                .build();
    }
```

`ApplicationDraft.java` 의 nested record: `public record DraftAnswer(String questionId, List<String> values) {}` (values null → `List.of()` 정규화 compact ctor 포함).

- [ ] **Step 3: 파급 지점 어댑트 (동작 동등성)** — 아래 순서대로. 각 항목은 "legacy 입출력 유지 + 내부만 record":

1. `CreateRecruitmentRequest.toCommand`: `questions` → `questions == null ? null : questions.stream().map(RecruitmentQuestion::createText).toList()` 로 매핑해 command 에 전달. `CreateRecruitmentCommand.questions` 타입을 `List<RecruitmentQuestion>` 으로 변경(compact ctor 의 SELF≥1/EXTERNAL=0 검사는 그대로, `List.copyOf` 유지).
2. `UpdateRecruitmentCommand.questions` 는 `List<String>` 유지(legacy 통로). `GeneralRecruitmentService.update` 의 질문 블록을 다음으로 교체:

```java
        List<RecruitmentQuestion> resolvedQuestions = null;
        if (updateRecruitmentCommand.questions() != null) {
            if (recruitment.getApplicationMode() != ApplicationMode.SELF) {
                throw new RecruitmentException.InvalidApplicationModeException(
                        "자체 폼 모집에서만 질문을 수정할 수 있습니다.");
            }
            resolvedQuestions = resolveLegacyQuestions(recruitment.getForm(), updateRecruitmentCommand.questions());
            // (기존 #603 주석 블록을 이 위치로 유지)
            boolean questionsChanged = recruitment.getForm() == null
                    || !recruitment.getForm().getQuestions().equals(resolvedQuestions);
            if (questionsChanged
                    && applicationRepository.countByRecruitmentId(recruitment.getId()) > 0) {
                throw new RecruitmentException.QuestionsNotEditableWithApplicationsException();
            }
        }
        recruitment.update(updateRecruitmentCommand, resolvedQuestions);
```

```java
    /**
     * legacy string[] 질문 수정 통로 (스펙 §2.5 안전 규칙 1·3 — 규칙 2 는 Task 2 에서 추가).
     * 규칙 1: 텍스트가 현재 질문과 순서까지 동일하면 no-op(id 보존) — 구 FE 가 다른 필드 수정과 함께
     *         동일 질문을 재전송하는 일반 경로를 보호한다.
     * 규칙 3: 다르면 전체 교체(신규 id 발급, 위 #603 가드 적용).
     */
    private List<RecruitmentQuestion> resolveLegacyQuestions(RecruitmentForm form, List<String> legacyTexts) {
        List<RecruitmentQuestion> currentQuestions = form == null ? List.of() : form.getQuestions();
        List<String> currentTexts = currentQuestions.stream().map(RecruitmentQuestion::text).toList();
        if (currentTexts.equals(legacyTexts)) {
            return currentQuestions;
        }
        return legacyTexts.stream().map(RecruitmentQuestion::createText).toList();
    }
```

3. `Recruitment.update(UpdateRecruitmentCommand command)` → `update(UpdateRecruitmentCommand command, List<RecruitmentQuestion> resolvedQuestions)` 로 변경, 내부 `command.questions()` 분기를 `resolvedQuestions != null` 분기로 교체(`form.replaceQuestions(resolvedQuestions)`). 다른 호출처가 있으면 컴파일러가 알려준다 — 전부 두 번째 인자 전달로 수정.
4. `RecruitmentDetailQuery.from`: `questions` 는 `form.getQuestions().stream().map(RecruitmentQuestion::text).toList()` — 응답 형태 불변. `// TODO(legacy-questions-v1): 신 FE 전환 후 questions(string[]) 필드 제거` 마커.
5. `MyApplicationDetailQuery.fromAll`: id 페어링으로 교체 —

```java
        List<RecruitmentQuestion> formQuestions = form == null ? List.of() : form.getQuestions();
        Map<String, ApplicationAnswer> answerByQuestionId = application.getAnswers().stream()
                .filter(answer -> answer.questionId() != null)
                .collect(Collectors.toMap(ApplicationAnswer::questionId, Function.identity(),
                        (first, duplicate) -> first));
        List<String> questions = formQuestions.stream().map(RecruitmentQuestion::text).toList();
        List<String> answers = formQuestions.stream()
                .map(question -> {
                    ApplicationAnswer answer = answerByQuestionId.get(question.id());
                    return question.formatAnswerValues(answer == null ? List.of() : answer.values());
                })
                .toList();
```

6. `ApplicantDetailQuery.buildPairedAnswers`: 같은 방식으로 교체 — EXTERNAL 은 기존대로 빈 리스트, 이후 **질문 순서대로 전 질문을** `QuestionAnswerQuery(question.text(), 표시 문자열)` 로 (답변 없는 질문은 빈 문자열 — 기존 min() 방어보다 정보 우위, 스펙 §2.7). 기존 min() 주석은 id 페어링 설명으로 대체.
7. `SubmitApplicationCommand` 는 `List<String> answers` 유지. `GeneralApplicationService.submit`: `validateAnswersAgainstForm` 호출을 아래로 교체 —

```java
        List<ApplicationAnswer> resolvedAnswers =
                resolveLegacyAnswers(recruitment, submitApplicationCommand.answers());
        validateAnswersAgainstForm(recruitment, resolvedAnswers);
        Application application = Application.submit(recruitment, eligibilityTarget.user(), resolvedAnswers);
```

```java
    /** legacy string[] 답변을 위치 순으로 질문 id 에 매핑한다. TODO(legacy-questions-v1): 신 FE 전환 후 제거. */
    private List<ApplicationAnswer> resolveLegacyAnswers(Recruitment recruitment, List<String> legacyAnswers) {
        List<RecruitmentQuestion> questions = questionsOf(recruitment);
        List<String> answers = legacyAnswers == null ? List.of() : legacyAnswers;
        if (questions.size() != answers.size()) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
        return IntStream.range(0, questions.size())
                .mapToObj(index -> new ApplicationAnswer(
                        questions.get(index).id(), Collections.singletonList(answers.get(index))))
                .toList();
    }

    private List<RecruitmentQuestion> questionsOf(Recruitment recruitment) {
        RecruitmentForm form = recruitment.getForm();
        return form == null ? List.of() : form.getQuestions();
    }
```

`validateAnswersAgainstForm(Recruitment, List<ApplicationAnswer>)` — Task 1 에서는 **개수·id 1:1 만** 검증(동작 동등성 — 유형별 규칙은 Task 3):

```java
    private void validateAnswersAgainstForm(Recruitment recruitment, List<ApplicationAnswer> answers) {
        List<RecruitmentQuestion> questions = questionsOf(recruitment);
        if (questions.size() != answers.size()) {
            throw new ApplicationDomainException.InvalidAnswersException();
        }
        Map<String, ApplicationAnswer> answerByQuestionId = new HashMap<>();
        for (ApplicationAnswer answer : answers) {
            if (answer.questionId() == null
                    || answerByQuestionId.put(answer.questionId(), answer) != null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
        }
        for (RecruitmentQuestion question : questions) {
            if (!answerByQuestionId.containsKey(question.id())) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
        }
    }
```

8. Draft: `UpsertDraftRequest.DraftAnswerPayload` → `(String questionId, String value, List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> values)` (`value` 는 legacy 통로 유지 + 2000자 제한 유지, `values` 는 `@Size(max = 20)` 개수 상한). `UpsertDraftCommand` 를 entity 비의존으로 재정의:

```java
public record UpsertDraftCommand(Long userId, Long recruitmentId, List<DraftAnswerEntry> answers) {
    /** value(legacy 단일 문자열) 또는 values(신형) 중 하나가 채워진다. */
    public record DraftAnswerEntry(String questionId, String value, List<String> values) {}
}
```

`GeneralApplicationDraftService.upsert` 에서 해석 후 저장:

```java
        List<ApplicationDraft.DraftAnswer> resolvedAnswers =
                resolveDraftAnswers(recruitment, command.answers());
        // ifPresentOrElse 의 replace/create 에 resolvedAnswers 전달 (기존 구조 유지)
```

```java
    /**
     * questionId 가 폼 질문 UUID 면 그대로, 숫자(legacy 인덱스)면 해당 위치 질문의 UUID 로 치환한다.
     * 어느 쪽도 아니면 엔트리를 버린다 — 임시저장은 제출이 아니므로 관대하게 처리 (스펙 §2.1·§2.5).
     * TODO(legacy-questions-v1): 숫자 인덱스 해석 제거.
     */
    private List<ApplicationDraft.DraftAnswer> resolveDraftAnswers(
            Recruitment recruitment, List<UpsertDraftCommand.DraftAnswerEntry> entries) {
        List<RecruitmentQuestion> questions = recruitment.getForm() == null
                ? List.of() : recruitment.getForm().getQuestions();
        Set<String> questionIds = questions.stream().map(RecruitmentQuestion::id)
                .collect(Collectors.toSet());
        List<ApplicationDraft.DraftAnswer> resolved = new ArrayList<>();
        for (UpsertDraftCommand.DraftAnswerEntry entry : entries) {
            String resolvedQuestionId = resolveQuestionId(entry.questionId(), questions, questionIds);
            if (resolvedQuestionId == null) {
                continue;
            }
            List<String> values = entry.values() != null ? entry.values()
                    : entry.value() != null ? List.of(entry.value()) : List.of();
            resolved.add(new ApplicationDraft.DraftAnswer(resolvedQuestionId, values));
        }
        return resolved;
    }

    private String resolveQuestionId(String rawQuestionId, List<RecruitmentQuestion> questions,
                                     Set<String> questionIds) {
        if (rawQuestionId == null) {
            return null;
        }
        if (questionIds.contains(rawQuestionId)) {
            return rawQuestionId;
        }
        try {
            int legacyIndex = Integer.parseInt(rawQuestionId);
            return legacyIndex >= 0 && legacyIndex < questions.size()
                    ? questions.get(legacyIndex).id() : null;
        } catch (NumberFormatException notAnIndex) {
            return null;
        }
    }
```

구 FE 의 `{"questionId": 0}` (JSON number) 는 Jackson 스칼라 강제변환으로 String `"0"` 에 바인딩된다 — 통합 테스트로 확인(아래 Step 5). `DraftResponse`·`ApplicationDraftQuery` 를 Read 해 answers 원소를 `(String questionId, List<String> values)` 형태로 어댑트(`exists` 등 나머지 형태 유지).
9. 픽스처·테스트 컴파일 정리: `./gradlew compileJava compileTestJava` 를 돌려 나오는 모든 에러를 수정. `common/fixture/` 의 질문 생성은 `RecruitmentQuestion.createText(...)` 매핑, 답변은 `ApplicationAnswer` 생성으로. **#604 null 정규화 테스트는 record 레벨 단언으로 의도를 이전**하고, 기존 응답 형태 단언(questions/answers string 리스트)은 그대로 통과해야 한다. draft 관련 테스트는 새 응답 형태(uuid questionId + values)에 맞춰 조정 — 조정 내역은 보고에 명시.

- [ ] **Step 4: record 단위 테스트 + 예외 추가** — `RecruitmentQuestionTest.java`: `formatAnswerValues` (TEXT 본문/빈, 선택형 라벨 조인/미해석 id 무시), `validateDefinitions` (TEXT+choices → 예외, 선택형 1개 → 예외, 라벨 중복 → 예외, id 중복 → 예외, 정상 통과), `ApplicationAnswer` null 원소 정규화. `validateDefinitions` 가 사용하는 예외는 이 태스크에서 `RecruitmentException` 에 추가한다 (Task 2 가 사용을 확장):

```java
    public static class InvalidQuestionDefinitionException extends RecruitmentException {
        public InvalidQuestionDefinitionException(String message) {
            super(message, HttpStatus.BAD_REQUEST);
        }
    }
```

(기존 `InvalidApplicationModeException` 의 커스텀 메시지 패턴을 Read 해 동일 형태로.)

- [ ] **Step 5: 전체 스위트 green 확인** — `cd backend && ./gradlew test` → BUILD SUCCESSFUL 직접 확인. 실패 테스트는 "구조 스왑으로 인한 형태 조정"인지 "행동 회귀"인지 구분해 전자만 조정, 후자는 구현 수정. 추가로 draft legacy 숫자 payload 통합 케이스 1개를 기존 draft 통합 테스트에 추가: `{"answers":[{"questionId":0,"value":"임시"}]}` PUT → GET 시 uuid questionId + `values:["임시"]`.

- [ ] **Step 6: 커밋** — `feat(backend): 질문·답변 jsonb 를 구조화 스키마로 승격 (V78 마이그레이션·record 스왑)`

---

## Task 2: questionItems 생성/수정 + 질문 정의 검증 + id 왕복 + 불변 가드

**Files:**
- Create: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/request/QuestionItemPayload.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/service/dto/command/QuestionItemCommand.java`
- Modify: `CreateRecruitmentRequest.java`, `UpdateRecruitmentRequest.java`, `CreateRecruitmentCommand.java`, `UpdateRecruitmentCommand.java`, `GeneralRecruitmentService.java`
- Create(Test): `backend/src/test/java/com/duing/domain/recruitment/controller/dto/request/QuestionItemPayloadValidationTest.java`
- Modify(Test): `backend/src/test/java/com/duing/domain/recruitment/service/RecruitmentCreateGuardsTest.java` 등 기존 가드 테스트 확장 (파일명은 Read 로 확인)

- [ ] **Step 1: 실패하는 테스트 작성**

Bean Validation 테스트(기존 `CreateRecruitmentRequestValidationTest` 패턴): 질문 텍스트 500자 경계/초과, 선택지 20개 경계/초과, 라벨 200자 경계/초과, 라벨 NotBlank, questionItems 50개 초과.

서비스/커맨드 단위 테스트 케이스(전부 실코드로):

```java
// [생성]
// 1. "questionItems 로 선택형 질문을 생성하면 질문·선택지에 UUID id 가 발급된다"
// 2. "생성 시 클라이언트가 보낸 질문 id 는 무시되고 새 id 가 발급된다"
// 3. "questions 와 questionItems 를 함께 보내면 400 으로 거부된다"
// 4. "선택형 질문의 선택지가 1개면 400 으로 거부된다"
// 5. "주관식 질문에 선택지가 있으면 400 으로 거부된다"
// 6. "같은 질문의 선택지 내용이 중복되면 400 으로 거부된다"
// [수정 — id 왕복]
// 7. "수정 시 id 를 보존해 보낸 기존 질문은 id 가 재생성되지 않는다" (반환 resolved 의 id 동일성 단언)
// 8. "수정 시 현재 폼에 없는 질문 id 는 400 으로 거부된다"
// 9. "수정 시 다른 질문의 선택지 id 를 보내면 400 으로 거부된다"
// 10. "id 없는 신규 질문·선택지에는 새 UUID 가 발급된다"
// [불변 가드]
// 11. "지원자가 있으면 선택지 라벨 변경도 409 로 차단된다"
// 12. "지원자가 있으면 질문 순서 변경도 409 로 차단된다"
// 13. "지원자가 있어도 완전히 동일한 questionItems 재전송은 허용된다"
// 14. "지원자가 있어도 완전히 동일한 legacy questions 재전송은 허용된다"
// [legacy 규칙 2]
// 15. "선택형 질문이 있는 폼을 legacy questions 로 변경하려 하면 400 으로 거부된다"
```

- [ ] **Step 2: 실패 확인** — 신규 필드·메서드 부재로 컴파일 실패.

- [ ] **Step 3: 구현**

`QuestionItemPayload.java` (Create/Update 요청 공용):

```java
package com.duing.domain.recruitment.controller.dto.request;

import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 구조화 질문 페이로드. id 는 수정 시 왕복용 — 생성 시엔 서버가 무시하고 새로 발급한다 (스펙 §2.2). */
public record QuestionItemPayload(
        String id,

        @NotBlank(message = "질문 항목은 빈 문자열일 수 없습니다.")
        @Size(max = 500, message = "질문은 500자 이하여야 합니다.")
        String text,

        @NotNull(message = "질문 유형은 필수 입력값입니다.")
        QuestionType type,

        // null 이면 필수 질문으로 간주한다 (스펙: 기본값 필수).
        Boolean required,

        @Size(max = 20, message = "선택지는 질문당 최대 20개까지 등록할 수 있습니다.")
        List<@Valid ChoiceItemPayload> choices
) {
    public record ChoiceItemPayload(
            String id,
            @NotBlank(message = "선택지는 빈 문자열일 수 없습니다.")
            @Size(max = 200, message = "선택지는 200자 이하여야 합니다.")
            String label
    ) {}

    public QuestionItemCommand toCommand() {
        return new QuestionItemCommand(
                id, text, type, required == null || required,
                choices == null ? List.of() : choices.stream()
                        .map(choice -> new QuestionItemCommand.ChoiceItemCommand(choice.id(), choice.label()))
                        .toList());
    }
}
```

`QuestionItemCommand.java`:

```java
package com.duing.domain.recruitment.service.dto.command;

import com.duing.domain.recruitment.entity.QuestionType;
import java.util.List;

public record QuestionItemCommand(
        String id, String text, QuestionType type, boolean required, List<ChoiceItemCommand> choices) {
    public record ChoiceItemCommand(String id, String label) {}
}
```

`CreateRecruitmentRequest`: `questionItems` 필드 추가 (`@Size(max = 50, message = "질문은 최대 50개까지 등록할 수 있습니다.") List<@Valid QuestionItemPayload> questionItems`) + 기존 `questions` 에 `// TODO(legacy-questions-v1): 신 FE 전환 후 제거` 마커. `toCommand` 에서 해석:

```java
        if (questions != null && questionItems != null) {
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "questions 와 questionItems 는 함께 보낼 수 없습니다.");
        }
        List<RecruitmentQuestion> resolvedQuestions;
        if (questionItems != null) {
            // 생성 시 클라이언트 id 는 무시하고 서버가 새로 발급한다 (스펙 §2.2).
            resolvedQuestions = questionItems.stream()
                    .map(QuestionItemPayload::toCommand)
                    .map(item -> RecruitmentQuestion.create(item.text(), item.type(), item.required(),
                            item.choices().stream()
                                    .map(choice -> QuestionChoice.create(choice.label()))
                                    .toList()))
                    .toList();
        } else {
            resolvedQuestions = questions == null ? null
                    : questions.stream().map(RecruitmentQuestion::createText).toList();
        }
```

`CreateRecruitmentCommand` compact ctor 끝에 `RecruitmentQuestion.validateDefinitions(questions)` 추가(빈 리스트 포함 안전).

`UpdateRecruitmentRequest`: `questionItems` 필드 동일 추가, `toCommand` 는 raw 전달(`List<QuestionItemCommand>` 매핑만). `UpdateRecruitmentCommand` 에 `List<QuestionItemCommand> questionItems` 필드 추가.

`GeneralRecruitmentService.update` 질문 블록 확장:

```java
        if (updateRecruitmentCommand.questions() != null && updateRecruitmentCommand.questionItems() != null) {
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "questions 와 questionItems 는 함께 보낼 수 없습니다.");
        }
        List<RecruitmentQuestion> resolvedQuestions = null;
        if (updateRecruitmentCommand.questions() != null || updateRecruitmentCommand.questionItems() != null) {
            if (recruitment.getApplicationMode() != ApplicationMode.SELF) { /* 기존 예외 */ }
            resolvedQuestions = updateRecruitmentCommand.questionItems() != null
                    ? resolveQuestionItems(recruitment.getForm(), updateRecruitmentCommand.questionItems())
                    : resolveLegacyQuestions(recruitment.getForm(), updateRecruitmentCommand.questions());
            // #603 확장: 지원자가 있으면 추가·삭제·순서·텍스트·타입·필수여부·선택지의 어떤 변경도 금지 (스펙 §2.3).
            // record equals 가 choices 의 id·label·순서까지 비교하므로 별도 필드별 비교가 필요 없다.
            boolean questionsChanged = recruitment.getForm() == null
                    || !recruitment.getForm().getQuestions().equals(resolvedQuestions);
            if (questionsChanged
                    && applicationRepository.countByRecruitmentId(recruitment.getId()) > 0) {
                throw new RecruitmentException.QuestionsNotEditableWithApplicationsException();
            }
        }
```

`resolveLegacyQuestions` 에 규칙 2 삽입 (규칙 1 뒤):

```java
        boolean currentAllLegacyShape = currentQuestions.stream().allMatch(question ->
                question.type() == QuestionType.TEXT && question.required() && question.choices().isEmpty());
        if (!currentAllLegacyShape) {
            // 구 FE 가 선택형 질문을 주관식으로 덮어써 데이터가 손실되는 것을 막는다 (스펙 §2.5 규칙 2).
            throw new RecruitmentException.InvalidQuestionDefinitionException(
                    "구 버전 형식으로는 선택형 질문이 있는 지원서를 수정할 수 없습니다.");
        }
```

`resolveQuestionItems` + `resolveChoices` 신규:

```java
    /** id 왕복 해석 — 기존 id 는 절대 재생성하지 않고, 미지 id 는 400 (스펙 §2.2). */
    private List<RecruitmentQuestion> resolveQuestionItems(RecruitmentForm form,
                                                           List<QuestionItemCommand> items) {
        Map<String, RecruitmentQuestion> currentById = form == null ? Map.of()
                : form.getQuestions().stream()
                        .collect(Collectors.toMap(RecruitmentQuestion::id, Function.identity()));
        List<RecruitmentQuestion> resolved = new ArrayList<>();
        for (QuestionItemCommand item : items) {
            if (item.id() == null) {
                resolved.add(RecruitmentQuestion.create(item.text(), item.type(), item.required(),
                        resolveChoices(null, item.choices())));
                continue;
            }
            RecruitmentQuestion existingQuestion = currentById.get(item.id());
            if (existingQuestion == null) {
                throw new RecruitmentException.InvalidQuestionDefinitionException("존재하지 않는 질문 id 입니다.");
            }
            resolved.add(new RecruitmentQuestion(existingQuestion.id(), item.text(), item.type(),
                    item.required(), resolveChoices(existingQuestion, item.choices())));
        }
        RecruitmentQuestion.validateDefinitions(resolved);
        return resolved;
    }

    private List<QuestionChoice> resolveChoices(RecruitmentQuestion existingQuestion,
                                                List<QuestionItemCommand.ChoiceItemCommand> choices) {
        Set<String> existingChoiceIds = existingQuestion == null ? Set.of()
                : existingQuestion.choices().stream().map(QuestionChoice::id).collect(Collectors.toSet());
        return choices.stream()
                .map(choice -> {
                    if (choice.id() == null) {
                        return QuestionChoice.create(choice.label());
                    }
                    // "그 질문의" 선택지인지까지 검증 — 타 질문 선택지 id 유입 차단 (스펙 §2.2).
                    if (!existingChoiceIds.contains(choice.id())) {
                        throw new RecruitmentException.InvalidQuestionDefinitionException(
                                "존재하지 않는 선택지 id 입니다.");
                    }
                    return new QuestionChoice(choice.id(), choice.label());
                })
                .toList();
    }
```

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.recruitment.*'` → PASS.

- [ ] **Step 5: 커밋** — `feat(backend): questionItems 생성·수정과 질문 정의 검증·id 왕복·불변 가드 추가`

---

## Task 3: answerItems 제출 + 유형별 답변 검증

**Files:**
- Modify: `SubmitApplicationRequest.java`, `SubmitApplicationCommand.java`, `GeneralApplicationService.java`, `ApplicationDomainException.java`
- Modify(Test): `SubmitApplicationRequestValidationTest.java`, 서비스 답변 검증 테스트(신규 케이스 추가 — 기존 파일 위치 Read 후 결정)

- [ ] **Step 1: 실패하는 테스트 작성** — 검증 매트릭스(전부 실코드, `@ParameterizedTest` 활용 권장):

```java
// [payload 분기]
// 1. "answers 와 answerItems 를 함께 보내면 400" / 2. "둘 다 없으면 400 (답변 목록은 필수)"
// [1:1 대응]
// 3. "미지 questionId 가 있으면 400" / 4. "questionId 중복이면 400" / 5. "질문 누락이면 400"
// [TEXT]
// 6. "필수 TEXT 에 공백 답변이면 400 (필수 질문에 답변을 입력해주세요.)"
// 7. "선택 TEXT 는 빈 values 로 제출 가능" / 8. "TEXT 에 values 2개면 400"
// [SINGLE_CHOICE]
// 9. "필수 SINGLE 미선택이면 400" / 10. "SINGLE 2개 선택이면 400 (유효하지 않은 선택지입니다.)"
// 11. "다른 질문의 choiceId 를 보내면 400" / 12. "미지 choiceId 면 400"
// [MULTIPLE_CHOICE]
// 13. "필수 MULTI 0개 선택이면 400" / 14. "choiceId 중복 선택이면 400"
// 15. "선택 MULTI 는 빈 values 허용" / 16. "정상 MULTI 는 choiceId 들이 그대로 저장된다" (save 캡처 단언)
// [legacy]
// 17. "전 질문 TEXT 폼은 legacy answers 로 제출 가능 (위치 매핑)"
// 18. "선택형 질문 폼에 legacy answers 를 보내면 400" (텍스트가 choiceId 일 수 없음)
```

Bean Validation 테스트: answerItems 50개 초과, values 원소 2000자 초과, values 21개 초과, questionId NotBlank.

- [ ] **Step 2: 실패 확인** — 컴파일 실패 또는 신규 케이스 FAIL.

- [ ] **Step 3: 구현**

`ApplicationDomainException` 에 추가:

```java
    /** 신·구 답변 페이로드 규칙 위반 — 메시지 가변 (스펙 §2.5). */
    public static class InvalidAnswerPayloadException extends ApplicationDomainException {
        public InvalidAnswerPayloadException(String message) {
            super(message, HttpStatus.BAD_REQUEST);
        }
    }

    public static class RequiredAnswerMissingException extends ApplicationDomainException {
        private static final String MESSAGE = "필수 질문에 답변을 입력해주세요.";
        public RequiredAnswerMissingException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static class InvalidChoiceSelectionException extends ApplicationDomainException {
        private static final String MESSAGE = "유효하지 않은 선택지입니다.";
        public InvalidChoiceSelectionException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
```

`SubmitApplicationRequest`:

```java
public record SubmitApplicationRequest(
        // TODO(legacy-questions-v1): 신 FE 전환 후 제거 — 위치 기반 legacy 통로.
        @Size(max = 50, message = "답변은 최대 50개까지 제출할 수 있습니다.")
        List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> answers,

        @Size(max = 50, message = "답변은 최대 50개까지 제출할 수 있습니다.")
        List<@Valid AnswerItemPayload> answerItems
) {
    public record AnswerItemPayload(
            @NotBlank(message = "questionId 는 필수 입력값입니다.")
            String questionId,
            @Size(max = 20, message = "선택 항목은 20개 이하여야 합니다.")
            List<@Size(max = 2000, message = "답변은 2000자 이하여야 합니다.") String> values
    ) {}

    public SubmitApplicationCommand toCommand(Long recruitmentId, Long userId) {
        return new SubmitApplicationCommand(recruitmentId, userId, answers,
                answerItems == null ? null : answerItems.stream()
                        .map(item -> new SubmitApplicationCommand.AnswerItem(item.questionId(), item.values()))
                        .toList());
    }
}
```

(기존 `@NotNull` 제거 — exactly-one 은 command compact ctor 가 담당.)

`SubmitApplicationCommand`:

```java
public record SubmitApplicationCommand(
        Long recruitmentId, Long userId, List<String> answers, List<AnswerItem> answerItems) {

    public SubmitApplicationCommand {
        if (answers != null && answerItems != null) {
            throw new ApplicationDomainException.InvalidAnswerPayloadException(
                    "answers 와 answerItems 는 함께 보낼 수 없습니다.");
        }
        if (answers == null && answerItems == null) {
            throw new ApplicationDomainException.InvalidAnswerPayloadException("답변 목록은 필수 입력값입니다.");
        }
    }

    public record AnswerItem(String questionId, List<String> values) {}
}
```

`GeneralApplicationService.submit` 해석 분기:

```java
        List<ApplicationAnswer> resolvedAnswers = submitApplicationCommand.answerItems() != null
                ? submitApplicationCommand.answerItems().stream()
                        .map(item -> new ApplicationAnswer(item.questionId(), item.values()))
                        .toList()
                : resolveLegacyAnswers(recruitment, submitApplicationCommand.answers());
```

`validateAnswersAgainstForm` 의 질문 루프에 유형별 검증 연결(Task 1 의 골격 확장):

```java
        for (RecruitmentQuestion question : questions) {
            ApplicationAnswer answer = answerByQuestionId.get(question.id());
            if (answer == null) {
                throw new ApplicationDomainException.InvalidAnswersException();
            }
            validateAnswerForQuestion(question, answer);
        }
```

```java
    /** 스펙 §2.6 유형별 규칙 — 필수/선택 × TEXT/SINGLE/MULTIPLE. */
    private void validateAnswerForQuestion(RecruitmentQuestion question, ApplicationAnswer answer) {
        List<String> values = answer.values();
        switch (question.type()) {
            case TEXT -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidAnswersException();
                }
                String content = values.isEmpty() ? "" : values.get(0);
                if (question.required() && content.isBlank()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
            }
            case SINGLE_CHOICE -> {
                if (values.size() > 1) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
            case MULTIPLE_CHOICE -> {
                if (question.required() && values.isEmpty()) {
                    throw new ApplicationDomainException.RequiredAnswerMissingException();
                }
                if (values.size() != Set.copyOf(values).size()) {
                    throw new ApplicationDomainException.InvalidChoiceSelectionException();
                }
                requireChoiceIdsBelongToQuestion(question, values);
            }
        }
    }

    /** "바로 그 질문의" 선택지인지 검증 — 타 질문·미지 choiceId 거부 (스펙 §2.6). */
    private void requireChoiceIdsBelongToQuestion(RecruitmentQuestion question, List<String> selectedChoiceIds) {
        Set<String> allowedChoiceIds = question.choices().stream()
                .map(QuestionChoice::id).collect(Collectors.toSet());
        if (!allowedChoiceIds.containsAll(selectedChoiceIds)) {
            throw new ApplicationDomainException.InvalidChoiceSelectionException();
        }
    }
```

**행동 변경 주의(보고에 명시):** 마이그레이션이 기존 질문을 `required=true` 로 승격하므로, 이전에 API 레벨에서 허용되던 "빈 문자열 답변 제출"이 400 이 된다. 구 FE 는 textarea `required` 로 이미 빈 제출을 막고 있어 실사용 영향 없음(스펙 §2.4 승격 정책). 이와 충돌하는 기존 테스트는 선택 질문 픽스처로 의도를 보존해 조정한다.

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.application.*'` → PASS.

- [ ] **Step 5: 커밋** — `feat(backend): answerItems 제출과 유형별 답변 검증 추가`

---

## Task 4: 상세 응답 questionItems + 통합 테스트 매트릭스

**Files:**
- Modify: `RecruitmentDetailQuery.java`, `RecruitmentDetailResponse.java`
- Create: `backend/src/main/java/com/duing/domain/recruitment/controller/dto/response/QuestionItemResponse.java`
- Create(Test): `backend/src/test/java/com/duing/domain/recruitment/controller/RecruitmentQuestionTypesIntegrationTest.java`

- [ ] **Step 1: 실패하는 통합 테스트 작성** — RestAssured 로 end-to-end (픽스처는 기존 leader/recruitment 통합 테스트 패턴):

```java
// 1. "questionItems 로 생성한 모집 상세는 questions(텍스트)와 questionItems(구조)를 함께 반환한다"
//    → 생성(TEXT 필수 + SINGLE 필수 2지선다 + MULTI 선택 3지선다) → GET 상세 →
//      body("data.questions", hasSize(3)), body("data.questionItems[1].type", equalTo("SINGLE_CHOICE")),
//      questionItems[*].id 와 choices[*].id 가 UUID 형식(널 아님) 단언
// 2. "answerItems 로 제출하면 내 지원서와 운영진 열람에 표시 문자열로 노출된다"
//    → 상세에서 얻은 questionId/choiceId 로 제출(MULTI 는 2개 선택) → 201 →
//      내 지원서 GET: answers[2] == "기획, 개발" 형태 단언 →
//      운영진 열람 GET: answers(QuestionAnswer)에 question 텍스트·answer 표시 문자열 단언
// 3. "필수 SINGLE 미선택 제출은 400 과 필수 안내 메시지를 반환한다"
// 4. "다른 질문의 choiceId 로 제출하면 400 유효하지 않은 선택지 메시지를 반환한다"
// 5. "선택(optional) 질문은 빈 values 로 제출할 수 있다"
// 6. "legacy answers 는 전 질문 TEXT 폼에서 여전히 동작한다" (기존 폼 → string[] 제출 → 201)
// 7. "지원자가 생긴 뒤 선택지 라벨 변경은 409 로 차단되고 동일 재전송은 허용된다"
// 8. "draft 신형 페이로드 PUT → GET 왕복이 uuid·values 를 보존한다"
// 9. "questions 와 questionItems 동시 전송 생성은 400"
```

- [ ] **Step 2: 실패 확인** — questionItems 응답 필드 부재로 FAIL.

- [ ] **Step 3: 구현**

`QuestionItemResponse.java`:

```java
package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import java.util.List;

public record QuestionItemResponse(
        String id, String text, QuestionType type, boolean required, List<ChoiceResponse> choices) {

    public record ChoiceResponse(String id, String label) {}

    public static QuestionItemResponse from(RecruitmentQuestion question) {
        return new QuestionItemResponse(
                question.id(), question.text(), question.type(), question.required(),
                question.choices().stream()
                        .map(choice -> new ChoiceResponse(choice.id(), choice.label()))
                        .toList());
    }
}
```

`RecruitmentDetailQuery` 에 `List<RecruitmentQuestion> questionItems` 필드 추가(from 에서 `form.getQuestions()` 전달, form 없으면 빈 리스트), `RecruitmentDetailResponse` 에 `List<QuestionItemResponse> questionItems` 추가 + from 매핑. 기존 `questions` 필드는 유지 + TODO 마커.

- [ ] **Step 4: 통과 확인** — `./gradlew test --tests 'com.duing.domain.recruitment.*' --tests 'com.duing.domain.application.*' --tests 'com.duing.domain.draft.*'` → PASS.

- [ ] **Step 5: 커밋** — `feat(backend): 모집 상세에 구조화 질문(questionItems) 노출`

---

## Task 5: 전체 테스트 + 개발 DB 드라이런 + PR

- [ ] `cd backend && ./gradlew test` → BUILD SUCCESSFUL (출력 직접 확인)
- [ ] **개발 DB 드라이런 (메인 세션 담당, subagent 금지):** MCP supabase(개발 DB)에서 V78 의 3개 UPDATE 를 SELECT 프리뷰(UPDATE 를 SELECT 로 재작성)로 실행해 실데이터 변환 결과를 눈으로 검증 — 특히 잉여 답변 questionId=null 보존, draft 인덱스 매핑. **쓰기 실행은 하지 않는다** (Flyway 가 배포 시 수행).
- [ ] 브랜치 adversarial 리뷰 1회 (Migration·데이터 무결성·API contract)
- [ ] self-check 7항목
- [ ] push + PR 생성 (제목: `feat(backend): 지원서 질문 유형(주관식·객관식)·필수 여부 지원`, 본문 🚀/🤔/💬, **머지 금지 — 사용자 지시 대기**)
