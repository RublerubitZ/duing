-- 총동연 FAQ 공개 검색 무결과(0건) 키워드의 집계 기록. 정규화된 keyword(trim·연속 공백 압축·lower)
-- 1개당 1행(UNIQUE) — raw 로그가 아니라 miss_count 증가·last_searched_at 갱신만 반복하는
-- ON CONFLICT DO UPDATE 원자 업서트로 테이블이 작게 유지된다(federation_faq_feedback 전례).
-- admin 전용 참고 신호라 삭제 이력은 필요 없다(deleted_at 은 BaseEntity 매핑용으로만 존재,
-- @SQLDelete 는 미사용).
CREATE TABLE federation_faq_search_miss (
    id               BIGSERIAL PRIMARY KEY,
    keyword          VARCHAR(100) NOT NULL,
    miss_count       BIGINT       NOT NULL DEFAULT 1,
    last_searched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_ffsm_keyword ON federation_faq_search_miss (keyword);
-- admin 목록의 고정 정렬(miss_count DESC, last_searched_at DESC)을 받치는 인덱스.
-- 이 테이블은 비로그인 공개 검색이 행을 늘릴 수 있어(고유 키워드당 1행) 정렬 비용을 상수화해 둔다.
CREATE INDEX idx_ffsm_sort ON federation_faq_search_miss (miss_count DESC, last_searched_at DESC);
ALTER TABLE federation_faq_search_miss ENABLE ROW LEVEL SECURITY;
