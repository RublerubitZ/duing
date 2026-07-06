package com.duing.domain.federation.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * FAQ "이 답변이 도움이 되었나요?" 피드백. 로그인은 user_id, 비로그인은 session_key 로 식별자당 1건
 * (부분 유니크 인덱스 2개가 경합 방어) — 재제출은 삭제·재작성이 아니라 값 갱신(upsert)이라
 * 삭제 이력이 필요 없다({@code @SQLDelete} 미사용). 쓰기(삽입·갱신)는 모두
 * {@link com.duing.domain.federation.repository.FederationFaqFeedbackRepository} 의
 * {@code ON CONFLICT DO UPDATE} 네이티브 쿼리로 이뤄지므로(동시 최초 제출 경합을 단일 문장 원자성으로
 * 해소), 엔티티 쪽 생성자·mutator 는 두지 않는다 — 조회(읽기)·QueryDSL 집계 전용.
 */
@Getter
@Entity
@Table(name = "federation_faq_feedback")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FederationFaqFeedback extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "faq_id", nullable = false)
    private FederationFaq faq;

    // 로그인 식별자 — 익명 피드백과 한 테이블에 혼재하는 성격상 연관관계가 아닌 단순 id 슬롯으로 둔다.
    // 비로그인 제출은 null, 그 경우 sessionKey 가 대체 식별자가 된다.
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "session_key", length = 64)
    private String sessionKey;

    @Column(nullable = false)
    private boolean helpful;
}
