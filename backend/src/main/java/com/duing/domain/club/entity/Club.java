package com.duing.domain.club.entity;

import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

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
}
