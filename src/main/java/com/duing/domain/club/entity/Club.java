package com.duing.domain.club.entity;

import com.duing.domain.user.entity.User;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "leader_id")
    private User leader;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ClubStatus status;

    @Builder(access = AccessLevel.PRIVATE)
    private Club(String name, ClubCategory category, String division, String description,
                 String logoUrl, User leader, ClubStatus status) {
        this.name = name;
        this.category = category;
        this.division = division;
        this.description = description;
        this.logoUrl = logoUrl;
        this.leader = leader;
        this.status = status;
    }

    public static Club create(String name, ClubCategory category, String division,
                              String description, String logoUrl, User leader) {
        return Club.builder()
                .name(name)
                .category(category)
                .division(division)
                .description(description)
                .logoUrl(logoUrl)
                .leader(leader)
                .status(ClubStatus.PENDING_APPROVAL)
                .build();
    }

    public void changeStatus(ClubStatus newStatus) {
        this.status = newStatus;
    }
}
