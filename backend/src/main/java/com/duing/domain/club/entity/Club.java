package com.duing.domain.club.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.Arrays;
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

    public List<String> getTags() {
        return tags == null ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(tags));
    }

    public List<ClubSnsLink> getSnsLinks() {
        return Collections.unmodifiableList(snsLinks);
    }

    public List<ClubFaq> getFaqs() {
        return Collections.unmodifiableList(faqs);
    }

    @Builder(access = AccessLevel.PRIVATE)
    private Club(String name, ClubCategory category, String division, String description,
                 String logoUrl, ClubStatus status) {
        this.name = name;
        this.category = category;
        this.division = division;
        this.description = description;
        this.logoUrl = logoUrl;
        this.status = status;
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl) {
        return Club.builder()
                .name(name)
                .category(category)
                .division(division)
                .description(description)
                .logoUrl(logoUrl)
                .status(ClubStatus.PENDING_APPROVAL)
                .build();
    }

    public void changeStatus(ClubStatus newStatus) {
        this.status = newStatus;
    }

    public void update(
            String name,
            ClubCategory category,
            String division,
            String description,
            String logoUrl,
            String coverUrl,
            List<String> tags,
            List<ClubSnsLink> snsLinks,
            List<ClubFaq> faqs
    ) {
        if (name != null) this.name = name;
        if (category != null) this.category = category;
        if (division != null) this.division = division;
        if (description != null) this.description = description;
        if (logoUrl != null) this.logoUrl = logoUrl;
        if (coverUrl != null) this.coverUrl = coverUrl;
        if (tags != null) this.tags = tags.toArray(new String[0]);
        if (snsLinks != null) this.snsLinks = new ArrayList<>(snsLinks);
        if (faqs != null) this.faqs = new ArrayList<>(faqs);
    }
}
