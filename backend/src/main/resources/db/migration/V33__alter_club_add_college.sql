-- club: 학과동아리(centralClub=false) 의 소속 단과대학.
-- 중앙동아리(centralClub=true) 는 null.
-- 값은 user.College enum 코드 (예: 'IT_ENGINEERING') 와 동일하게 저장한다.
ALTER TABLE club ADD COLUMN college VARCHAR(40);

COMMENT ON COLUMN club.college IS
    '학과동아리의 소속 단과대학 (user.College enum 코드). 중앙동아리는 null.';
