package com.duing.domain.clubmember.entity;

import com.duing.domain.club.entity.Club;
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
@Table(name = "club_member")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_member SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubMember extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ClubMemberRole role;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubMember(Club club, User user, ClubMemberRole role) {
        this.club = club;
        this.user = user;
        this.role = role;
    }

    public static ClubMember asLeader(Club club, User user) {
        return ClubMember.builder().club(club).user(user).role(ClubMemberRole.LEADER).build();
    }

    public static ClubMember asMember(Club club, User user) {
        return ClubMember.builder().club(club).user(user).role(ClubMemberRole.MEMBER).build();
    }

    public static ClubMember of(Club club, User user, ClubMemberRole role) {
        return ClubMember.builder().club(club).user(user).role(role).build();
    }

    public boolean canManageClub() {
        return role.canManageClub();
    }

    public void changeRole(ClubMemberRole newRole) {
        this.role = newRole;
    }
}
