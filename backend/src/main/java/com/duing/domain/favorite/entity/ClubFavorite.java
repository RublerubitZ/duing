package com.duing.domain.favorite.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "club_favorite",
        uniqueConstraints = @UniqueConstraint(name = "uq_club_favorite", columnNames = {"user_id", "club_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClubFavorite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private ClubFavorite(User user, Club club) {
        this.user = user;
        this.club = club;
        this.createdAt = LocalDateTime.now();
    }

    public static ClubFavorite create(User user, Club club) {
        return new ClubFavorite(user, club);
    }
}