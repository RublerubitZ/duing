package com.duing.domain.club.entity;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.user.entity.College;
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

    @Enumerated(EnumType.STRING)
    @Column(length = 40)
    private College college;

    /** 단과대 동아리의 소속 학과. 자유입력·선택값이며 중앙동아리는 표시되지 않는다. */
    @Column(name = "department", length = 50)
    private String department;

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

    @Enumerated(EnumType.STRING)
    @Column(name = "contact_visibility", nullable = false, length = 20)
    private ContactVisibility contactVisibility = ContactVisibility.PUBLIC;

    @Column(name = "membership_fee_amount")
    private Integer membershipFeeAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_cycle", nullable = false, length = 20)
    private FeeCycle feeCycle = FeeCycle.NONE;

    /** 회비 안내문 — 분야별/신규·기존 차등 등 자유 텍스트. 대표 회비(feeCycle/금액)와 독립. */
    @Column(name = "fee_note", length = 150)
    private String feeNote;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "projects", columnDefinition = "jsonb", nullable = false)
    private List<ClubProject> projects = new ArrayList<>();

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @Column(name = "central_club", nullable = false)
    private boolean centralClub;

    /** 회원 기수 표시 여부. 순수 UI 표시 제어 설정으로 쓰기 게이트가 아니다. */
    @Column(name = "use_generation", nullable = false)
    private boolean useGeneration;

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

    public List<ClubProject> getProjects() {
        return Collections.unmodifiableList(projects);
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

    /** 빈 문자열·공백만 있는 텍스트는 null 로 정규화한다(프론트의 비우기 의도 ""를 저장은 null 로 통일). */
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** 학과는 자유입력이라 앞뒤 공백을 떨어내고 저장한다(빈 값은 미지정과 같은 null). */
    private static String normalizeDepartment(String value) {
        return value == null ? null : blankToNull(value.strip());
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Club(String name, ClubCategory category, String division, String description,
                 String logoUrl, ClubStatus status, boolean centralClub, College college,
                 String department) {
        this.name = name;
        this.category = category;
        this.division = division;
        this.description = description;
        this.logoUrl = logoUrl;
        this.status = status;
        this.centralClub = centralClub;
        this.college = college;
        this.department = department;
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl) {
        return create(name, category, division, description, logoUrl, false, null);
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl, boolean centralClub,
                              College college) {
        return create(name, category, division, description, logoUrl, centralClub, college, null);
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl, boolean centralClub,
                              College college, String department) {
        return Club.builder()
                .name(name)
                .category(category)
                .division(division)
                .description(description)
                .logoUrl(logoUrl)
                .status(ClubStatus.PENDING_APPROVAL)
                .centralClub(centralClub)
                .college(college)
                .department(normalizeDepartment(department))
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

    /** 폐쇄 가능 여부 검증. 운영 중단(INACTIVE) 또는 거절(REJECTED) 상태만 허용한다. */
    public void validateClosable() {
        if (this.status != ClubStatus.INACTIVE && this.status != ClubStatus.REJECTED) {
            throw new ClubException.ClubNotClosableException(this.status.name());
        }
    }

    public void changeCentralClub(boolean next) {
        this.centralClub = next;
    }

    public void changeUseGeneration(boolean next) {
        this.useGeneration = next;
    }

    public void updateLastVerifiedYear(int year) {
        if (this.lastVerifiedYear == null || year > this.lastVerifiedYear) {
            this.lastVerifiedYear = year;
        }
    }

    public record UpdatePayload(
            String name,                         // 1
            ClubCategory category,               // 2
            String division,                     // 3
            String description,                  // 4
            String logoUrl,                      // 5
            String coverUrl,                     // 6
            List<String> tags,                   // 7
            List<ClubSnsLink> snsLinks,          // 8
            List<ClubFaq> faqs,                  // 9
            Integer foundedYear,                 // 10
            Integer cohortNumber,                // 11
            String location,                     // 12
            Integer activityFrequency,           // 13
            Set<DayOfWeek> activeDays,           // 14
            String tagline,                      // 15
            List<String> highlights,             // 16
            ContactVisibility contactVisibility, // 17
            FeeCycle feeCycle,                   // 18
            Integer membershipFeeAmount,         // 19
            List<ClubProject> projects,          // 20
            College college,                     // 21
            Boolean clearCollege,                // 22
            Boolean clearLogoImage,              // 23
            Boolean clearCoverImage,             // 24
            Boolean useGeneration,               // 25
            String feeNote,                      // 26
            String department                    // 27
    ) {}

    public void update(UpdatePayload payload) {
        if (payload.name() != null) this.name = payload.name();
        if (payload.category() != null) this.category = payload.category();
        if (payload.division() != null) this.division = blankToNull(payload.division());
        if (payload.description() != null) this.description = blankToNull(payload.description());
        if (Boolean.TRUE.equals(payload.clearLogoImage())) {
            this.logoUrl = null;
        } else if (payload.logoUrl() != null) {
            this.logoUrl = payload.logoUrl();
        }
        if (Boolean.TRUE.equals(payload.clearCoverImage())) {
            this.coverUrl = null;
        } else if (payload.coverUrl() != null) {
            this.coverUrl = payload.coverUrl();
        }
        if (payload.tags() != null) this.tags = payload.tags().stream().distinct().toArray(String[]::new);
        if (payload.snsLinks() != null) {
            this.snsLinks = payload.snsLinks().stream()
                    .map(ClubSnsLink::normalized)
                    .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        }
        if (payload.faqs() != null) this.faqs = new ArrayList<>(payload.faqs());
        if (payload.foundedYear() != null) this.foundedYear = payload.foundedYear();
        if (payload.cohortNumber() != null) this.cohortNumber = payload.cohortNumber();
        if (payload.location() != null) this.location = blankToNull(payload.location());
        if (payload.activityFrequency() != null) this.activityFrequency = payload.activityFrequency();
        if (payload.activeDays() != null) this.activeDays = toActiveDaysCsv(payload.activeDays());
        if (payload.tagline() != null) this.tagline = blankToNull(payload.tagline());
        if (payload.highlights() != null) this.highlights = new ArrayList<>(payload.highlights());
        if (payload.contactVisibility() != null) this.contactVisibility = payload.contactVisibility();
        if (payload.feeCycle() != null) {
            // 회비는 주기+금액 쌍으로만 갱신 — NONE 이면 금액을 무조건 비운다 (DB CHECK 정합).
            this.feeCycle = payload.feeCycle();
            this.membershipFeeAmount =
                    payload.feeCycle() == FeeCycle.NONE ? null : payload.membershipFeeAmount();
        }
        if (payload.projects() != null) this.projects = new ArrayList<>(payload.projects());
        if (Boolean.TRUE.equals(payload.clearCollege())) {
            // 단과대 동아리는 단과대학이 정체성이라 비울 수 없다. 리더·총동연 어느 경로로 들어와도
            // 여기서 막히므로 새로운 college NULL 행이 생기지 않는다(기존 NULL 행은 그대로 통과).
            if (!this.centralClub) {
                throw new ClubException.CollegeRequiredException();
            }
            this.college = null;
        } else if (payload.college() != null) {
            this.college = payload.college();
        }
        if (payload.useGeneration() != null) this.useGeneration = payload.useGeneration();
        if (payload.feeNote() != null) this.feeNote = blankToNull(payload.feeNote());
        if (payload.department() != null) this.department = normalizeDepartment(payload.department());
    }
}
