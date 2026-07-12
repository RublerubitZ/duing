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
@Table(name = "federation_inquiry_answer")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_inquiry_answer SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationInquiryAnswer extends BaseEntity {

    // 1:1 강제는 DB partial unique(uq_federation_inquiry_answer)가 백스톱 — 연관관계 대신 id 보관.
    @Column(name = "inquiry_id", nullable = false)
    private Long inquiryId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "answered_by", nullable = false)
    private Long answeredBy;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationInquiryAnswer(Long inquiryId, String content, Long answeredBy) {
        this.inquiryId = inquiryId;
        this.content = content;
        this.answeredBy = answeredBy;
    }

    public static FederationInquiryAnswer create(Long inquiryId, String content, Long answeredBy) {
        return FederationInquiryAnswer.builder()
                .inquiryId(inquiryId).content(content).answeredBy(answeredBy).build();
    }

    public void updateContent(String content) {
        this.content = content;
    }
}
