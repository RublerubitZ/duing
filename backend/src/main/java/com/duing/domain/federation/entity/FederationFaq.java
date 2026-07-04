package com.duing.domain.federation.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "federation_faq")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_faq SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationFaq extends BaseEntity {

    // 필수 FK지만 의도적으로 @ManyToOne 미사용 — 카테고리 유효성·삭제 경합은 서비스 레이어에서
    // PESSIMISTIC_WRITE 잠금+재검증으로 다룬다(스펙 2026-07-04-federation-qna-design §4). 연관관계로 바꾸지 말 것.
    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(nullable = false, length = 300)
    private String question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    @Column(name = "is_pinned", nullable = false)
    private boolean pinned;

    @Column(name = "is_published", nullable = false)
    private boolean published;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationFaq(Long categoryId, String question, String answer,
                          boolean pinned, boolean published, int sortOrder, Long authorId) {
        this.categoryId = categoryId;
        this.question = question;
        this.answer = answer;
        this.pinned = pinned;
        this.published = published;
        this.sortOrder = sortOrder;
        this.viewCount = 0L;
        this.authorId = authorId;
    }

    public static FederationFaq create(Long categoryId, String question, String answer,
                                       boolean pinned, boolean published, int sortOrder, Long authorId) {
        return FederationFaq.builder()
                .categoryId(categoryId)
                .question(question)
                .answer(answer)
                .pinned(pinned)
                .published(published)
                .sortOrder(sortOrder)
                .authorId(authorId)
                .build();
    }

    public void update(Long categoryId, String question, String answer, boolean pinned, boolean published) {
        this.categoryId = categoryId;
        this.question = question;
        this.answer = answer;
        this.pinned = pinned;
        this.published = published;
    }

    public void changeSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }
}
