package com.duing.domain.federation.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 총동연 1:1 비밀문의 첨부 이미지.
 *
 * <p>storage_key 는 공개 URL 이 아닌 스토리지 키 — 비밀성: URL 은 응답에 절대 노출하지 않는다.
 * 원본 바이트는 인증 프록시 다운로드(작성자 or ADMIN)로만 스트리밍한다.
 *
 * <p>수정 이력이 없는 첨부 슬롯이라 {@code BaseEntity} 를 상속하지 않는다(Notification 전례).
 */
@Getter
@Entity
@Table(name = "federation_inquiry_attachment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE federation_inquiry_attachment SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationInquiryAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "inquiry_id", nullable = false)
    private FederationInquiry inquiry;

    // 답변 측 첨부 슬롯(후속) — 연관관계 대신 id 로만 보관, 질문 첨부 흐름에서는 항상 null.
    @Column(name = "answer_id")
    private Long answerId;

    @Column(name = "storage_key", nullable = false, length = 500)
    private String storageKey;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private Long fileSize;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationInquiryAttachment(FederationInquiry inquiry, String storageKey, String fileName,
                                        String contentType, Long fileSize, int sortOrder) {
        this.inquiry = inquiry;
        this.storageKey = storageKey;
        this.fileName = fileName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.sortOrder = sortOrder;
    }

    public static FederationInquiryAttachment create(FederationInquiry inquiry, String storageKey, String fileName,
                                                      String contentType, Long fileSize, int sortOrder) {
        return FederationInquiryAttachment.builder()
                .inquiry(inquiry)
                .storageKey(storageKey)
                .fileName(fileName)
                .contentType(contentType)
                .fileSize(fileSize)
                .sortOrder(sortOrder)
                .build();
    }
}
