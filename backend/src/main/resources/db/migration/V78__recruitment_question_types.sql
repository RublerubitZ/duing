-- 질문/답변/임시저장 jsonb 를 구조화 스키마로 승격 (스펙 §2.1·§2.4).
--
-- [게이트 설계 원칙 — 총체적(total) 판별]
-- 세 UPDATE 의 WHERE 는 모두 "이미 신형이면 스킵, 그 외에는 전부 변환" 으로 쓴다.
-- 반대 방향("legacy 로 보이는 형태만 변환")으로 쓰면 열거하지 못한 예상 밖의 형태가
-- 조용히 미변환 상태로 남는다. Hibernate 는 이 컬럼들을 이제 record 리스트로 역직렬화하므로,
-- 그렇게 남은 행은 다음 조회 시점에 역직렬화 예외 → HTTP 500 이 된다.
-- 실제로 과거엔 요청 DTO 에 원소 검증이 없어(#604 이전) questions 에 JSON null 원소가,
-- draft answers 에 questionId=null 원소가 저장될 수 있었다. 열거형 게이트는 이런 행을 놓친다.
-- 미변환 행을 0 으로 만드는 쪽이 언제나 안전하므로 "신형이 아니면 변환" 으로 뒤집는다.
-- (빈 배열은 bool_and 가 NULL → IS DISTINCT FROM true → 변환 대상이 되지만, 결과도 '[]' 라 무해하다.)

-- 1) 질문: ["질문", ...] → [{"id": uuid, "text", "type": "TEXT", "required": true, "choices": []}, ...]
--    신형 판별: 모든 원소가 object. 이미 신형인 행은 스킵되므로 재실행해도 질문 id 가 재발급되지 않는다.
--    JSON null 원소(과거 malformed 저장)는 jsonb_array_elements_text 가 SQL NULL 로 내보내므로
--    COALESCE 로 빈 문자열 질문으로 정규화한다 — 이게 없으면 text 가 NULL 인 질문이 만들어진다.
UPDATE recruitment_form
SET questions = COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', gen_random_uuid()::text,
                        'text', COALESCE(legacy_question.question_text, ''),
                        'type', 'TEXT',
                        'required', true,
                        'choices', '[]'::jsonb)
                    ORDER BY legacy_question.position)
           FROM jsonb_array_elements_text(questions)
                WITH ORDINALITY AS legacy_question(question_text, position)),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_typeof(question_element) = 'object')
         FROM jsonb_array_elements(questions) AS question_element) IS DISTINCT FROM true;

-- 2) 답변: ["답변", ...] → [{"questionId": <같은 위치 질문의 id | null>, "values": ["답변"]}, ...]
--    신형 판별: 모든 원소가 object. 질문 수를 초과하는 잉여 답변은 questionId=null 로 무손실 보존한다
--    (LEFT JOIN LATERAL 이므로 매치 실패가 행 전체를 비우지 않는다 — 현재도 화면 비노출 데이터).
--    JSON null 원소는 빈 문자열로 정규화. PII 스크럽된 '[]' 행은 '[]' 로 재기록되므로 값 변화가 없다.
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
WHERE (SELECT bool_and(jsonb_typeof(answer_element) = 'object')
         FROM jsonb_array_elements(application.answers) AS answer_element) IS DISTINCT FROM true;

-- 3) 임시저장: [{"questionId": 0, "value": "..."}] → [{"questionId": "<같은 위치 질문의 id | null>", "values": ["..."]}]
--    legacy·신형 모두 원소가 object 라 1·2 번처럼 jsonb_typeof 로는 구분할 수 없다.
--    신형 판별은 'values' 키의 존재로 한다 — legacy DraftAnswer(Long questionId, String value) 는
--    'value' 만 갖고 'values' 를 가진 적이 없으며, 신형 DraftAnswer(String questionId, List values) 는
--    항상 'values' 를 직렬화한다(전역 NON_NULL 설정 없음).
--    questionId 의 타입으로 판별하면 안 된다: 아래에서 무손실 보존한 questionId=null 원소가 신형인데도
--    'string' 이 아니라서 재실행 시 다시 변환 대상이 되고, 그때는 questionId 가 number 가 아니라
--    전부 폐기되어 행이 '[]' 로 날아간다(멱등성 파괴 + 데이터 손실).
--
--    폼이 없는(예: EXTERNAL 모집에 남은 잔재) 행이나 질문 범위를 벗어난 인덱스는 questionId=null 로
--    무손실 보존한다(2번과 동일 원칙). value 누락은 [] 로.
--
--    [bigint 캐스트 오버플로 방어] questionId 는 요청 DTO 에 범위 검증이 없어 Long.MAX_VALUE 저장이
--    가능했다. 그대로 '::bigint + 1' 하면 "bigint out of range" 로 마이그레이션 전체가 실패한다.
--    질문 개수 상한이 50 이므로 정수·비음수·9자리 이하만 캐스트를 통과시킨다. 통과하지 못한 원소
--    (JSON null·키 누락·음수·소수·거대값)는 아래 WHERE 에서 폐기된다 — 어차피 매칭될 질문이 없다.
--
--    방어는 이중이다. WHERE 는 legacy_entry 단독 조건이라 Postgres 가 함수 스캔의 baserestrictinfo 로
--    내려 LATERAL 조인 조건보다 먼저 평가하지만(EXPLAIN 확인), 그것은 플래너 구현 세부사항이다.
--    가정이 깨졌을 때의 대가가 "행 하나 미변환" 이 아니라 마이그레이션 전체 실패(배포 차단)라 비대칭적으로
--    크므로, 캐스트 자체도 CASE 로 감싸 안전한 문자열만 ::bigint 에 도달하게 한다 — 조인 순서·플랜과
--    무관하게 오버플로가 불가능해진다. CASE 가 NULL 을 내면 어떤 question_position 과도 매치되지 않는다.
UPDATE application_draft
SET answers = COALESCE(
        (SELECT jsonb_agg(
                    jsonb_build_object(
                        'questionId', matched_question.question_id,
                        'values', CASE
                                      WHEN legacy_entry.entry -> 'value' IS NULL
                                           OR jsonb_typeof(legacy_entry.entry -> 'value') = 'null'
                                          THEN '[]'::jsonb
                                      ELSE jsonb_build_array(legacy_entry.entry -> 'value')
                                  END)
                    ORDER BY legacy_entry.position)
           FROM jsonb_array_elements(application_draft.answers)
                WITH ORDINALITY AS legacy_entry(entry, position)
           LEFT JOIN LATERAL (
               SELECT question_slot.question_element ->> 'id' AS question_id
                 FROM recruitment_form form,
                      jsonb_array_elements(form.questions)
                      WITH ORDINALITY AS question_slot(question_element, question_position)
                WHERE form.recruitment_id = application_draft.recruitment_id
                  AND question_slot.question_position = CASE
                          WHEN (legacy_entry.entry ->> 'questionId') ~ '^[0-9]{1,9}$'
                              THEN (legacy_entry.entry ->> 'questionId')::bigint + 1
                      END
           ) AS matched_question ON true
          WHERE jsonb_typeof(legacy_entry.entry -> 'questionId') = 'number'
            AND (legacy_entry.entry ->> 'questionId') ~ '^[0-9]{1,9}$'),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_exists(draft_entry, 'values'))
         FROM jsonb_array_elements(answers) AS draft_entry) IS DISTINCT FROM true;
