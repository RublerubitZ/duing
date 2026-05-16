-- 로컬/테스트용 시드 데이터.
-- BCrypt 해시는 Spring Security BCryptPasswordEncoder 와 호환되는 $2b$ 포맷.
-- 평문 비밀번호: student123! / leader123! / admin123!
-- 운영 환경 분리가 도입되면 이 파일은 dev 프로파일 전용 위치로 이동한다.

INSERT INTO users (student_id, name, email, password_hash, role) VALUES
    ('20250001', '학생테스터',   'student@daegu.ac.kr', '$2b$10$S1UDKlLy5TTKzI3DUe2uRuL.W2DT//TUnGs3Fmzo6fs3OKXRuYZD.', 'STUDENT'),
    ('20250002', '운영자테스터', 'leader@daegu.ac.kr',  '$2b$10$8tArhzMmdVhfhvpGSzs1VeK56.UCDy0ezm/KzuLAIcTRamE2XePnG', 'STUDENT'),
    ('20250003', '총동연관리자', 'admin@daegu.ac.kr',   '$2b$10$3n2TxB.c34Zq6BY5mj1fbONNibNA4Bddp9yAMWn2V3iFaBRI0VJfS', 'ADMIN')
ON CONFLICT (email) DO NOTHING;

INSERT INTO club (name, category, division, description, status, tags) VALUES
    ('두잉 코딩 동아리', 'ACADEMIC',  '공과대학',     '대구대학교 코딩 학술 동아리. 알고리즘·웹·앱 프로젝트 진행.', 'ACTIVE', ARRAY['코딩','알고리즘','웹']),
    ('두잉 사진부',     'ART',       '예술대학',     '캠퍼스 라이프를 기록하는 사진 동아리.',                       'ACTIVE', ARRAY['사진','전시']),
    ('두잉 축구부',     'SPORTS',    '체육대학',     '주말마다 모여서 축구하는 동아리.',                            'ACTIVE', ARRAY['축구','스포츠']),
    ('두잉 봉사단',     'VOLUNTEER', '사회복지대학', '지역사회 연계 봉사활동을 진행하는 동아리.',                   'ACTIVE', ARRAY['봉사','지역사회']),
    ('두잉 밴드',       'CULTURE',   '예술대학',     '학내 공연을 주관하는 밴드 동아리.',                           'ACTIVE', ARRAY['밴드','공연','음악'])
ON CONFLICT (name) DO NOTHING;

-- 두잉 코딩 동아리의 LEADER 멤버십을 leader@daegu.ac.kr 계정에 부여.
INSERT INTO club_member (club_id, user_id, role)
SELECT c.id, u.id, 'LEADER'
FROM club c
JOIN users u ON u.email = 'leader@daegu.ac.kr'
WHERE c.name = '두잉 코딩 동아리'
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM club_member cm
      WHERE cm.club_id = c.id
        AND cm.user_id = u.id
        AND cm.deleted_at IS NULL
  );
