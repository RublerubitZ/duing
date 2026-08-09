-- club.name 의 full UNIQUE 제약을 partial unique index 로 교체한다.
--
-- 기존 제약(club_name_key, V2) 은 soft-delete (deleted_at IS NOT NULL) 행도 이름을 차지해
-- 폐쇄한 동아리와 같은 이름의 재생성을 막는다. Hibernate 의 @SQLRestriction("deleted_at IS NULL")
-- 이 적용된 existsByName 은 폐쇄된 행을 못 보기 때문에, 애플리케이션은 "중복 없음" 으로 통과시킨 뒤
-- INSERT 단계에서 DB 제약 충돌을 일으키고 GlobalExceptionHandler 가 이를 409 로 변환한다.
--
-- users(V18) · club_member(V7) 가 이미 같은 partial 인덱스 패턴 (WHERE deleted_at IS NULL) 으로
-- 정의돼 있어 도메인 간 정책을 일치시킨다. 활성 동아리끼리의 이름 유일성은 그대로 유지된다.

ALTER TABLE club DROP CONSTRAINT IF EXISTS club_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uk_club_name_active
    ON club (name)
    WHERE deleted_at IS NULL;
