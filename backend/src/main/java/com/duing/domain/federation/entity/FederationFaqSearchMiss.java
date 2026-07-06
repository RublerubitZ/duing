package com.duing.domain.federation.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 총동연 FAQ 공개 검색에서 결과 0건인 정규화 키워드의 집계. 키워드(trim·연속 공백 압축·lower) 1개당
 * 1행(UNIQUE) — miss_count 증가·last_searched_at 갱신은 모두
 * {@link com.duing.domain.federation.repository.FederationFaqSearchMissRepository} 의
 * {@code ON CONFLICT DO UPDATE} 네이티브 업서트로만 이뤄지므로(FederationFaqFeedback 전례와 동일 이유),
 * 엔티티 쪽 생성자·mutator 는 두지 않는다 — admin 조회 전용 읽기 모델.
 */
@Getter
@Entity
@Table(name = "federation_faq_search_miss")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FederationFaqSearchMiss extends BaseEntity {

    @Column(nullable = false, length = 100)
    private String keyword;

    @Column(name = "miss_count", nullable = false)
    private Long missCount;

    @Column(name = "last_searched_at", nullable = false)
    private LocalDateTime lastSearchedAt;
}
