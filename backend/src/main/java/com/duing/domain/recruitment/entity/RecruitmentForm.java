package com.duing.domain.recruitment.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(name = "recruitment_form")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recruitment_form SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class RecruitmentForm extends BaseEntity {

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recruitment_id", nullable = false, unique = true)
    private Recruitment recruitment;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private List<RecruitmentQuestion> questions;

    @Builder(access = AccessLevel.PRIVATE)
    private RecruitmentForm(Recruitment recruitment, List<RecruitmentQuestion> questions) {
        this.recruitment = recruitment;
        this.questions = questions;
    }

    public static RecruitmentForm create(Recruitment recruitment, List<RecruitmentQuestion> questions) {
        List<RecruitmentQuestion> sanitized = questions == null ? new ArrayList<>() : new ArrayList<>(questions);
        return RecruitmentForm.builder()
                .recruitment(recruitment)
                .questions(sanitized)
                .build();
    }

    public List<RecruitmentQuestion> getQuestions() {
        return Collections.unmodifiableList(questions);
    }

    public void replaceQuestions(List<RecruitmentQuestion> newQuestions) {
        this.questions = List.copyOf(newQuestions);
    }
}
