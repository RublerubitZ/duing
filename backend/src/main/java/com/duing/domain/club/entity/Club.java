package com.duing.domain.club.entity;

import com.duing.domain.club.exception.ClubException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

/**
 * 동아리 마스터 엔티티.
 * 회장/임원/회원 관계는 {@code ClubMember} 테이블로 정규화되어 있다.
 * "현재 회장" 정보는 ClubMember 에서 role = LEADER 인 행을 조회하여 도출한다.
 */
@Getter
@Entity
@Table(name = "club")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class Club extends BaseEntity {

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ClubCategory category;

    @Column(length = 50)
    private String division;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ClubStatus status;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    // Hibernate 6 의 SqlTypes.ARRAY 매핑은 List<String> 에서 JSONB 로 잘못 직렬화되는
    // 잠복 이슈가 있어 native String[] 로 보관한다. 외부에는 getTags() 가 List 뷰로 노출.
    @Column(name = "tags", columnDefinition = "_text", nullable = false)
    private String[] tags = new String[0];

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "sns_links", columnDefinition = "jsonb", nullable = false)
    private List<ClubSnsLink> snsLinks = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "faqs", columnDefinition = "jsonb", nullable = false)
    private List<ClubFaq> faqs = new ArrayList<>();

    @Column(name = "founded_year")
    private Integer foundedYear;

    @Column(name = "cohort_number")
    private Integer cohortNumber;

    @Column(name = "location", length = 200)
    private String location;

    @Column(name = "contact_email", length = 200)
    private String contactEmail;

    @Column(name = "activity_frequency")
    private Integer activityFrequency;

    /**
     * 활동 요일 CSV. 예: "MONDAY,WEDNESDAY,FRIDAY". 외부 노출은 {@link #getActiveDays()} 의 Set 뷰로 한다.
     */
    @Column(name = "active_days", length = 50)
    private String activeDays;

    @Column(name = "membership_fee", length = 100)
    private String membershipFee;

    @Column(name = "tagline", length = 60)
    private String tagline;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "highlights", columnDefinition = "jsonb", nullable = false)
    private List<String> highlights = new ArrayList<>();

    @Column(name = "major_projects", columnDefinition = "TEXT")
    private String majorProjects;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "central_club", nullable = false)
    private boolean centralClub;

    @Column(name = "last_verified_year")
    private Integer lastVerifiedYear;

    @Column(name = "status_changed_by")
    private Long statusChangedBy;

    @Column(name = "status_changed_at")
    private LocalDateTime statusChangedAt;

    public List<String> getTags() {
        return tags == null ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(tags));
    }

    public List<ClubSnsLink> getSnsLinks() {
        return Collections.unmodifiableList(snsLinks);
    }

    public List<ClubFaq> getFaqs() {
        return Collections.unmodifiableList(faqs);
    }

    public List<String> getHighlights() {
        return Collections.unmodifiableList(highlights);
    }

    public Set<DayOfWeek> getActiveDays() {
        if (activeDays == null || activeDays.isBlank()) {
            return Collections.emptySet();
        }
        Set<DayOfWeek> result = new LinkedHashSet<>();
        for (String token : activeDays.split(",")) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) continue;
            result.add(DayOfWeek.valueOf(trimmed));
        }
        return Collections.unmodifiableSet(result);
    }

    private static String toActiveDaysCsv(Set<DayOfWeek> days) {
        if (days == null || days.isEmpty()) return null;
        List<DayOfWeek> sorted = new ArrayList<>(days);
        sorted.sort(Comparator.naturalOrder());
        StringBuilder builder = new StringBuilder();
        for (DayOfWeek day : sorted) {
            if (builder.length() > 0) builder.append(',');
            builder.append(day.name());
        }
        return builder.toString();
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Club(String name, ClubCategory category, String division, String description,
                 String logoUrl, ClubStatus status, boolean centralClub) {
        this.name = name;
        this.category = category;
        this.division = division;
        this.description = description;
        this.logoUrl = logoUrl;
        this.status = status;
        this.centralClub = centralClub;
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl) {
        return create(name, category, division, description, logoUrl, false);
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl, boolean centralClub) {
        return Club.builder()
                .name(name)
                .category(category)
                .division(division)
                .description(description)
                .logoUrl(logoUrl)
                .status(ClubStatus.PENDING_APPROVAL)
                .centralClub(centralClub)
                .build();
    }

    public void changeStatus(ClubStatus next, String reason, Long actorUserId) {
        if (!this.status.canTransitionTo(next)) {
            throw new ClubException.InvalidClubStatusTransitionException(this.status.name(), next.name());
        }
        if (next == ClubStatus.REJECTED) {
            String normalized = reason == null ? "" : reason.strip();
            if (normalized.isEmpty()) {
                throw new ClubException.RejectionReasonRequiredException();
            }
            this.rejectionReason = normalized;
        } else {
            this.rejectionReason = null;
        }
        this.status = next;
        this.statusChangedBy = actorUserId;
        this.statusChangedAt = LocalDateTime.now();
    }

    public void changeCentralClub(boolean next) {
        this.centralClub = next;
    }

    public void updateLastVerifiedYear(int year) {
        this.lastVerifiedYear = year;
    }

    public record UpdatePayload(
            String name,
            ClubCategory category,
            String division,
            String description,
            String logoUrl,
            String coverUrl,
            List<String> tags,
            List<ClubSnsLink> snsLinks,
            List<ClubFaq> faqs,
            Integer foundedYear,
            Integer cohortNumber,
            String location,
            String contactEmail,
            Integer activityFrequency,
            Set<DayOfWeek> activeDays,
            String membershipFee,
            String tagline,
            List<String> highlights,
            String majorProjects
    ) {}

    public void update(UpdatePayload payload) {
        if (payload.name() != null) this.name = payload.name();
        if (payload.category() != null) this.category = payload.category();
        if (payload.division() != null) this.division = payload.division();
        if (payload.description() != null) this.description = payload.description();
        if (payload.logoUrl() != null) this.logoUrl = payload.logoUrl();
        if (payload.coverUrl() != null) this.coverUrl = payload.coverUrl();
        if (payload.tags() != null) this.tags = payload.tags().stream().distinct().toArray(String[]::new);
        if (payload.snsLinks() != null) this.snsLinks = new ArrayList<>(payload.snsLinks());
        if (payload.faqs() != null) this.faqs = new ArrayList<>(payload.faqs());
        if (payload.foundedYear() != null) this.foundedYear = payload.foundedYear();
        if (payload.cohortNumber() != null) this.cohortNumber = payload.cohortNumber();
        if (payload.location() != null) this.location = payload.location();
        if (payload.contactEmail() != null) this.contactEmail = payload.contactEmail();
        if (payload.activityFrequency() != null) this.activityFrequency = payload.activityFrequency();
        if (payload.activeDays() != null) this.activeDays = toActiveDaysCsv(payload.activeDays());
        if (payload.membershipFee() != null) this.membershipFee = payload.membershipFee();
        if (payload.tagline() != null) this.tagline = payload.tagline();
        if (payload.highlights() != null) this.highlights = new ArrayList<>(payload.highlights());
        if (payload.majorProjects() != null) this.majorProjects = payload.majorProjects();
    }
}
