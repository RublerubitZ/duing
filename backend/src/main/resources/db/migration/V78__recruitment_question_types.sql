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
--    과거 null 원소는 빈 문자열로 정규화. PII 스크럽된 '[]' 행은 자연 스킵.
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

-- 3) 임시저장: [{"questionId": 0, "value": "..."}] → [{"questionId": "<같은 위치 질문의 id | null>", "values": ["..."]}]
--    폼 자체가 없는(예: EXTERNAL 모집에 남은 잔재) 행이나 질문 범위를 벗어난 인덱스는 questionId=null 로
--    무손실 보존한다(2번 답변 마이그레이션과 동일 원칙 — LEFT JOIN LATERAL 이므로 매치 실패가 행 전체를
--    비우지 않는다). value 누락은 [] 로. 원소 중 하나라도 questionId 가 JSON null(과거 malformed 저장)이면
--    그 원소만 폐기하고, 그 존재만으로 행 전체가 미변환 상태로 남지 않도록 게이트에서 'null' 타입도 허용한다
--    (허용하지 않으면 해당 행이 영원히 legacy 모양으로 남아 다음 조회 시 역직렬화 오류를 유발할 수 있다).
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
                  AND question_slot.question_position = (legacy_entry.entry ->> 'questionId')::bigint + 1
           ) AS matched_question ON true
          WHERE jsonb_typeof(legacy_entry.entry -> 'questionId') = 'number'),
        '[]'::jsonb)
WHERE (SELECT bool_and(jsonb_typeof(draft_entry -> 'questionId') IN ('number', 'null'))
         FROM jsonb_array_elements(answers) AS draft_entry) IS NOT FALSE;
