-- club.name 의 full UNIQUE 제약을 partial unique index 로 교체한다.
--
-- 기존 제약(club_name_key, V2) 은 soft-delete (deleted_at IS NOT NULL) 행도 이름을 차지해
-- 폐쇄한 동아리와 같은 이름의 재생성을 막는다. Hibernate 의 @SQLRestriction("deleted_at IS NULL")
-- 이 적용된 existsByName 은 폐쇄된 행을 못 보기 때문에, 애플리케이션은 "중복 없음" 으로 통과시킨 뒤
-- INSERT 단계에서 DB 제약 충돌을 일으키고 GlobalExceptionHandler 가 이를 409 로 변환한다.
--
-- users(V18) · club_member(V7) 가 이미 같은 partial 인덱스 패턴 (WHERE deleted_at IS NULL) 으로
-- 정의돼 있어 도메인 간 정책을 일치시킨다. 활성 동아리끼리의 이름 유일성은 그대로 유지된다.
--
-- ⚠ 롤백: 이 마이그레이션 이후 폐쇄된 이름이 한 번이라도 재사용되면 같은 이름의 삭제 행이 2개 이상
-- 생기므로, 예전 스키마의 full UNIQUE 는 다시 만들 수 없다(duplicate key 로 영구 실패). 되돌리려면
-- 제약 재생성 전에 삭제 행의 이름을 먼저 개명해야 한다 — 예: UPDATE club SET name = name || '__deleted_'
-- || id WHERE deleted_at IS NOT NULL. V95 · V103 과 같은 roll-forward 전용 구간이다.

DO $$
DECLARE
    legacy_constraint text;
BEGIN
    -- 제약명(club_name_key) 은 V2 의 컬럼 UNIQUE 에 Postgres 가 자동으로 붙인 이름이라 운영 DB 에서
    -- 다를 수 있다. DROP CONSTRAINT IF EXISTS 로 이름을 지정하면 어긋났을 때 조용히 no-op 이 되고,
    -- 아래 인덱스만 추가된 채 마이그레이션이 "성공" 으로 기록되어 버그가 안 고쳐진 채 배포된다.
    -- 그래서 이름이 아니라 "name 단일 컬럼 UNIQUE" 라는 정의로 찾아 지운다.
    SELECT conname INTO legacy_constraint
    FROM pg_constraint
    WHERE conrelid = 'club'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'club'::regclass AND attname = 'name')];

    IF legacy_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE club DROP CONSTRAINT %I', legacy_constraint);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_club_name_active
    ON club (name)
    WHERE deleted_at IS NULL;
