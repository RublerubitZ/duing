-- 동아리 카테고리 '문화'(CULTURE) 를 '창작'(CREATION) 으로 개편한다.
-- '예술'(ART) 과 의미가 겹쳐 구분이 모호했던 문제 해소.
--
-- club.category 는 VARCHAR(30) 이고 CHECK 제약이 없으므로 값 치환만으로 충분하다.
-- soft delete 된 행도 함께 바꾼다 — 남겨두면 복구 시 ClubCategory enum 파싱에 실패한다.
-- updated_at 은 건드리지 않는다 (사용자 수정으로 보이면 안 됨).
UPDATE club SET category = 'CREATION' WHERE category = 'CULTURE';
