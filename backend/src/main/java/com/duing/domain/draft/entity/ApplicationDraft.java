package com.duing.domain.draft.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(name = "application_draft",
        uniqueConstraints = @UniqueConstraint(name = "uq_application_draft", columnNames = {"user_id", "recruitment_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ApplicationDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "recruitment_id", nullable = false)
    private Long recruitmentId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answers", columnDefinition = "jsonb", nullable = false)
    private List<DraftAnswer> answers;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static ApplicationDraft create(Long userId, Long recruitmentId, List<DraftAnswer> answers) {
        ApplicationDraft draft = new ApplicationDraft();
        draft.userId = userId;
        draft.recruitmentId = recruitmentId;
        draft.answers = answers == null ? new ArrayList<>() : new ArrayList<>(answers);
        draft.createdAt = LocalDateTime.now();
        draft.updatedAt = draft.createdAt;
        return draft;
    }

    public void replace(List<DraftAnswer> newAnswers) {
        this.answers = newAnswers == null ? new ArrayList<>() : new ArrayList<>(newAnswers);
        this.updatedAt = LocalDateTime.now();
    }

    public List<DraftAnswer> getAnswers() {
        return Collections.unmodifiableList(answers);
    }

    public record DraftAnswer(Long questionId, String value) {}
}