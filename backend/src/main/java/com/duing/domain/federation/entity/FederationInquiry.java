package com.duing.domain.federation.entity;

import com.duing.domain.federation.exception.FederationInquiryException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "federation_inquiry")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
// @Version 도입으로 Hibernate 가 두 번째 파라미터로 version 을 전달 — 학생 삭제 vs 관리자 답변
// 레이스에서 한쪽이 반드시 0 row 로 충돌을 감지한다(Application 전례).
@SQLDelete(sql = "UPDATE federation_inquiry SET deleted_at = NOW() WHERE id = ? AND version = ?")
@SQLRestriction("deleted_at IS NULL")
public class FederationInquiry extends BaseEntity {

    @Column(name = "author_id", nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FederationInquiryStatus status;

    @Column(name = "answered_at")
    private LocalDateTime answeredAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "closed_reason", length = 200)
    private String closedReason;

    // 동시 커밋 충돌 감지 + FE version echo(stale-render 방어)의 기준값. Hibernate 가 직접 채운다.
    @Version
    @Column(nullable = false)
    private Long version;

    @Builder(access = AccessLevel.PRIVATE)
    private FederationInquiry(Long authorId, String title, String content) {
        this.authorId = authorId;
        this.title = title;
        this.content = content;
        this.status = FederationInquiryStatus.RECEIVED;
    }

    public static FederationInquiry create(Long authorId, String title, String content) {
        return FederationInquiry.builder().authorId(authorId).title(title).content(content).build();
    }

    public boolean isAuthor(Long userId) {
        return this.authorId.equals(userId);
    }

    /** 작성자 수정 — 관리자가 답변 작성을 시작하기 전(RECEIVED)까지만. */
    public void updateContent(String title, String content) {
        if (!this.status.isEditableByAuthor()) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "총동연이 답변을 작성 중이거나 처리된 문의는 수정할 수 없습니다.");
        }
        this.title = title;
        this.content = content;
    }

    /** 관리자 "답변 작성" CTA — RECEIVED 에서만. 이미 IN_PROGRESS 인 멱등 처리는 서비스에서. */
    public void startProgress() {
        if (!this.status.canTransitionTo(FederationInquiryStatus.IN_PROGRESS)) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "답변중으로 전환할 수 없는 상태입니다: " + this.status);
        }
        this.status = FederationInquiryStatus.IN_PROGRESS;
    }

    /**
     * 관리자 "접수로 되돌리기" CTA — IN_PROGRESS 에서만. 답변 작성 방치로 인한 학생 영구 수정
     * 잠금의 수동 탈출구(startProgress 전례와 동일 구조 — dirty checking 으로 version 증가).
     * 이미 RECEIVED 인 멱등 처리는 서비스에서.
     */
    public void revertToReceived() {
        if (!this.status.canTransitionTo(FederationInquiryStatus.RECEIVED)) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "접수 상태로 되돌릴 수 없는 상태입니다: " + this.status);
        }
        this.status = FederationInquiryStatus.RECEIVED;
    }

    /** 답변 등록 시 자동 전이 — dirty checking 으로 version 이 증가한다(JPQL 벌크 금지). */
    public void markAnswered() {
        if (!this.status.canReceiveAnswer()) {
            throw new FederationInquiryException.InquiryAlreadyAnsweredException();
        }
        this.status = FederationInquiryStatus.ANSWERED;
        this.answeredAt = LocalDateTime.now();
    }

    public void close(String closedReason) {
        if (!this.status.canTransitionTo(FederationInquiryStatus.CLOSED)) {
            throw new FederationInquiryException.InvalidInquiryStatusException(
                    "종료할 수 없는 상태입니다: " + this.status);
        }
        this.status = FederationInquiryStatus.CLOSED;
        this.closedAt = LocalDateTime.now();
        this.closedReason = closedReason;
    }
}
