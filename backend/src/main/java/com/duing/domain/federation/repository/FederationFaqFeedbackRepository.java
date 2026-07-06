package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqFeedback;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationFaqFeedbackRepository
        extends JpaRepository<FederationFaqFeedback, Long>, FederationFaqFeedbackRepositoryCustom {

    Optional<FederationFaqFeedback> findByFaqIdAndUserId(Long faqId, Long userId);

    Optional<FederationFaqFeedback> findByFaqIdAndSessionKey(Long faqId, String sessionKey);

    // 로그인 사용자 피드백 upsert. find→분기→save/update 대신 INSERT ... ON CONFLICT DO UPDATE 단일 문장으로
    // 삽입·갱신을 원자화해, 동시 최초 제출 경합을 단일 문장 원자성으로 해소(커밋 시점 재flush 500 방지)한다.
    // uq_fff_faq_user 부분 유니크 인덱스의 술어(WHERE user_id IS NOT NULL)를 ON CONFLICT 절에 그대로
    // 명시해야 매칭된다(생략 시 Postgres 가 어느 인덱스와도 매칭하지 못해 에러). created_at/updated_at 은
    // INSERT 시 DB DEFAULT NOW()(V76)를 그대로 쓰고, 갱신 시에만 updated_at 을 명시적으로 bump 한다.
    // flushAutomatically 불필요: submitFeedback 트랜잭션은 이 호출 전 federation_faq_feedback 에 대한
    // 선행 쓰기가 없다. clearAutomatically 는 켠다 — 같은 트랜잭션 내 후속 조회의 1차 캐시 오염 방지.
    @Modifying(clearAutomatically = true)
    @Query(value = """
            INSERT INTO federation_faq_feedback (faq_id, user_id, helpful)
            VALUES (:faqId, :userId, :helpful)
            ON CONFLICT (faq_id, user_id) WHERE user_id IS NOT NULL
            DO UPDATE SET helpful = EXCLUDED.helpful, updated_at = NOW()
            """, nativeQuery = true)
    void upsertByFaqIdAndUserId(@Param("faqId") Long faqId, @Param("userId") Long userId,
                                 @Param("helpful") boolean helpful);

    // 비로그인 사용자(sessionKey) 피드백 upsert — 위 upsertByFaqIdAndUserId 와 동일한 이유·구조
    // (flushAutomatically 불필요 판단 포함). uq_fff_faq_session 부분 유니크 인덱스의 술어
    // (WHERE user_id IS NULL AND session_key IS NOT NULL)를 ON CONFLICT 절에 그대로 명시해야 매칭된다.
    @Modifying(clearAutomatically = true)
    @Query(value = """
            INSERT INTO federation_faq_feedback (faq_id, session_key, helpful)
            VALUES (:faqId, :sessionKey, :helpful)
            ON CONFLICT (faq_id, session_key) WHERE user_id IS NULL AND session_key IS NOT NULL
            DO UPDATE SET helpful = EXCLUDED.helpful, updated_at = NOW()
            """, nativeQuery = true)
    void upsertByFaqIdAndSessionKey(@Param("faqId") Long faqId, @Param("sessionKey") String sessionKey,
                                     @Param("helpful") boolean helpful);
}
