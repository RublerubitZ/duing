package com.duing.domain.recruitment.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
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
import java.time.LocalDateTime;
import java.util.List;
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

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(nullable = false)
    private int capacity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RecruitmentStatus status;

    /** 실제 종료 시각(V101). CLOSED 인데 비어 있으면 가입 링크는 사용 불가로 본다(fail-closed). */
    @Column(name = "closed_at")
    private LocalDateTime closedAt;

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

    @Column(name = "interview_start_date")
    private LocalDate interviewStartDate;

    @Column(name = "interview_end_date")
    private LocalDate interviewEndDate;

    @Column(name = "show_applicant_count", nullable = false)
    private boolean showApplicantCount;

    @OneToOne(mappedBy = "recruitment", fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    private RecruitmentForm form;

    @Builder(access = AccessLevel.PRIVATE)
    private Recruitment(Club club, String title, String content, LocalDate startDate,
                        LocalDate endDate, int capacity, RecruitmentStatus status,
                        ApplicationMode applicationMode, String externalFormUrl,
                        boolean useInterview, TargetRole targetRole,
                        LocalDate interviewStartDate, LocalDate interviewEndDate,
                        boolean showApplicantCount) {
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
        this.interviewStartDate = interviewStartDate;
        this.interviewEndDate = interviewEndDate;
        this.showApplicantCount = showApplicantCount;
    }

    public static Recruitment create(Club club, String title, String content,
                                     LocalDate startDate, LocalDate endDate, int capacity) {
        return createWithOptions(club, title, content, startDate, endDate, capacity,
                ApplicationMode.SELF, null, false, TargetRole.MEMBER,
                null, null, false);
    }

    /**
     * 외부폼 / 면접 / targetRole 옵션을 지정해 모집 공고를 생성한다.
     * 외부폼 / 자체폼 분기 검증(externalFormUrl·questions) 은 호출 측에서 수행한다.
     */
    public static Recruitment createWithOptions(Club club, String title, String content,
                                                LocalDate startDate, LocalDate endDate, int capacity,
                                                ApplicationMode applicationMode, String externalFormUrl,
                                                boolean useInterview, TargetRole targetRole,
                                                LocalDate interviewStartDate,
                                                LocalDate interviewEndDate,
                                                boolean showApplicantCount) {
        if (endDate != null && endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("모집 종료일은 시작일보다 빠를 수 없습니다.");
        }
        if (capacity <= 0) {
            throw new IllegalArgumentException("모집 정원은 1명 이상이어야 합니다.");
        }
        if (interviewStartDate != null && interviewEndDate != null
                && interviewEndDate.isBefore(interviewStartDate)) {
            throw new RecruitmentException.InvalidInterviewPeriodException();
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
                .interviewStartDate(interviewStartDate)
                .interviewEndDate(interviewEndDate)
                .showApplicantCount(showApplicantCount)
                .build();
    }

    public void attachForm(RecruitmentForm recruitmentForm) {
        this.form = recruitmentForm;
    }

    public boolean isEffectivelyOpen(LocalDate today) {
        if (status != RecruitmentStatus.OPEN) {
            return false;
        }
        return endDate == null || !today.isAfter(endDate);
    }

    public void update(UpdateRecruitmentCommand command, List<RecruitmentQuestion> resolvedQuestions) {
        if (this.status == RecruitmentStatus.CLOSED) {
            throw new RecruitmentException.RecruitmentAlreadyClosedException();
        }
        if (command.title() != null) {
            if (command.title().isBlank()) {
                throw new IllegalArgumentException("제목은 공백일 수 없습니다.");
            }
            this.title = command.title();
        }
        if (command.content() != null) {
            this.content = command.content();
        }
        LocalDate resolvedStartDate = command.startDate() != null ? command.startDate() : this.startDate;
        if (command.endDate() != null) {
            // 기존이 상시모집(endDate=null)이면 기간모집으로 전환 금지
            if (this.endDate == null) {
                throw new RecruitmentException.AlwaysOpenConversionNotAllowedException();
            }
            if (command.endDate().isBefore(resolvedStartDate)) {
                throw new RecruitmentException.InvalidRecruitmentPeriodException();
            }
            this.endDate = command.endDate();
        }
        if (command.startDate() != null) {
            if (this.endDate != null && this.endDate.isBefore(command.startDate())) {
                throw new RecruitmentException.InvalidRecruitmentPeriodException();
            }
            this.startDate = command.startDate();
        }
        if (command.capacity() != null) {
            this.capacity = command.capacity();
        }
        if (command.useInterview() != null) {
            this.useInterview = command.useInterview();
        }
        if (resolvedQuestions != null) {
            if (this.form == null) {
                throw new IllegalStateException("자체 폼이 없는 모집 공고에서 질문을 수정할 수 없습니다.");
            }
            this.form.replaceQuestions(resolvedQuestions);
        }
        if (command.interviewStartDate() != null || command.interviewEndDate() != null) {
            LocalDate resolvedInterviewStart = command.interviewStartDate() != null
                    ? command.interviewStartDate() : this.interviewStartDate;
            LocalDate resolvedInterviewEnd = command.interviewEndDate() != null
                    ? command.interviewEndDate() : this.interviewEndDate;
            if (resolvedInterviewStart != null && resolvedInterviewEnd != null
                    && resolvedInterviewEnd.isBefore(resolvedInterviewStart)) {
                throw new RecruitmentException.InvalidInterviewPeriodException();
            }
            this.interviewStartDate = resolvedInterviewStart;
            this.interviewEndDate = resolvedInterviewEnd;
        }
        if (command.showApplicantCount() != null) {
            this.showApplicantCount = command.showApplicantCount();
        }
    }

    /**
     * 모집을 마감하고 실제 종료 시각을 스탬프한다.
     *
     * <p>{@code closedAt} 은 가입 링크의 사용 가능 기간 기준점이므로(스펙 v2 4.3) 종료 전이 경로마다
     * 반드시 남겨야 한다 — 벌크 마감({@code closeAllOpenByClubId})도 같은 값을 함께 UPDATE 한다.
     * seoulClock 벽시계(KST)로 기록하고 응답 경계에서 절대시각으로 변환한다(TIMEZONE.md).
     */
    public void close(LocalDateTime closedAt) {
        if (this.status == RecruitmentStatus.CLOSED) {
            throw new RecruitmentException.RecruitmentAlreadyClosedException();
        }
        this.status = RecruitmentStatus.CLOSED;
        this.closedAt = closedAt;
    }
}
