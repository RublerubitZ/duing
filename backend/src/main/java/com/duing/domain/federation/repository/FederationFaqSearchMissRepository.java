package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationFaqSearchMissRepository extends JpaRepository<FederationFaqSearchMiss, Long> {

    // 무결과 검색어 집계 upsert. FederationFaqFeedbackRepository 전례와 동일한 이유로 find→분기→save/update
    // 대신 INSERT ... ON CONFLICT DO UPDATE 단일 문장으로 삽입·갱신을 원자화한다(동시에 같은 키워드가
    // 무결과로 반복 검색되는 경합을 단일 문장 원자성으로 해소). uq_ffsm_keyword 유니크 인덱스가 매칭 대상.
    // clearAutomatically 는 켠다 — 같은 트랜잭션 내 후속 조회의 1차 캐시 오염을 방지한다(FederationFaqSearchMissRecorder
    // 가 TransactionTemplate 으로 여는 REQUIRES_NEW 트랜잭션은 호출마다 새 영속성 컨텍스트라 실질적 효과는 없지만,
    // 관례를 그대로 따른다).
    @Modifying(clearAutomatically = true)
    @Query(value = """
            INSERT INTO federation_faq_search_miss (keyword) VALUES (:keyword)
            ON CONFLICT (keyword) DO UPDATE SET
                miss_count = federation_faq_search_miss.miss_count + 1,
                last_searched_at = NOW(),
                updated_at = NOW()
            """, nativeQuery = true)
    void upsertByKeyword(@Param("keyword") String keyword);
}
