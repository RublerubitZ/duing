package com.duing.domain.recruitment.entity;

import com.duing.domain.club.entity.Club;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

@Getter
@Entity
@Table(name = "recruitment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE recruitment SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Recruitment extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String content;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(nullable = false)
    private int capacity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecruitmentStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "application_mode", nullable = false, length = 20)
    private ApplicationMode applicationMode;

    @Column(name = "external_form_url", length = 500)
    private String externalFormUrl;

    @Column(name = "use_interview", nullable = false)
    private boolean useInterview;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_role", nullable = false, length = 20)
    private TargetRole targetRole;

    @OneToOne(mappedBy = "recruitment", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private RecruitmentForm form;

    @Builder(access = AccessLevel.PRIVATE)
    private Recruitment(Club club, String title, String content, LocalDate startDate,
                        LocalDate endDate, int capacity, RecruitmentStatus status,
                        ApplicationMode applicationMode, String externalFormUrl,
                        boolean useInterview, TargetRole targetRole) {
        this.club = club;
        this.title = title;
        this.content = content;
        this.startDate = startDate;
        this.endDate = endDate;
        this.capacity = capacity;
        this.status = status;
        this.applicationMode = applicationMode;
        this.externalFormUrl = externalFormUrl;
        this.useInterview = useInterview;
        this.targetRole = targetRole;
    }

    public static Recruitment create(Club club, String title, String content,
                                     LocalDate startDate, LocalDate endDate, int capacity) {
        return createWithOptions(club, title, content, startDate, endDate, capacity,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER);
    }

    /**
     * 외부폼 / 면접 / targetRole 옵션을 지정해 모집 공고를 생성한다.
     * 외부폼 / 자체폼 분기 검증(externalFormUrl·questions) 은 호출 측에서 수행한다.
     */
    public static Recruitment createWithOptions(Club club, String title, String content,
                                                LocalDate startDate, LocalDate endDate, int capacity,
                                                ApplicationMode applicationMode, String externalFormUrl,
                                                boolean useInterview, TargetRole targetRole) {
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("모집 종료일은 시작일보다 빠를 수 없습니다.");
        }
        if (capacity <= 0) {
            throw new IllegalArgumentException("모집 정원은 1명 이상이어야 합니다.");
        }
        return Recruitment.builder()
                .club(club)
                .title(title)
                .content(content)
                .startDate(startDate)
                .endDate(endDate)
                .capacity(capacity)
                .status(RecruitmentStatus.OPEN)
                .applicationMode(applicationMode)
                .externalFormUrl(externalFormUrl)
                .useInterview(useInterview)
                .targetRole(targetRole)
                .build();
    }

    public void attachForm(RecruitmentForm recruitmentForm) {
        this.form = recruitmentForm;
    }

    public boolean isEffectivelyOpen(LocalDate today) {
        return status == RecruitmentStatus.OPEN && !today.isAfter(endDate);
    }
}
