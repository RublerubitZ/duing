package com.duing.domain.club.heroactivity.entity;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.photo.entity.ClubPhoto;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/**
 * 대표 활동 6 슬롯 — club_photo 를 FK 참조하는 큐레이션(V92).
 *
 * <p>DB 부분 유니크 인덱스 {@code (club_id, display_order)}/{@code (club_id, club_photo_id)}
 * {@code WHERE deleted_at IS NULL} 은 <b>살아있는 행의 슬롯·사진 중복만</b> 막는다.
 * "슬롯 최대 6개"·"1..6 범위" 는 DB 가 아니라 앱 레이어({@code GeneralClubHeroActivityService}
 * 의 {@code MIN_SLOT/MAX_SLOT} 검증)가 보장한다 — DB 만 보면 display_order=99 도 삽입 가능하다.
 *
 * <p>{@code CHECK (display_order BETWEEN 1 AND 6)} 를 순진하게 추가하면 안 된다: reorder 2-pass 가
 * 슬롯 스왑 중 전원을 목표값의 <b>음수 임시값</b>으로 바꿔 flush 하므로 그 CHECK 는 즉시 깨진다.
 * 굳이 넣으려면 음수 임시값을 허용하는 {@code CHECK (abs(display_order) BETWEEN 1 AND 6)} 형태여야 한다.
 */
@Getter
@Entity
@Table(name = "club_hero_activity")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE club_hero_activity SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class ClubHeroActivity extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_id", nullable = false)
    private Club club;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "club_photo_id", nullable = false)
    private ClubPhoto clubPhoto;

    @Column(nullable = false, length = 30)
    private String title;

    @Column(nullable = false, length = 80)
    private String description;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Builder(access = AccessLevel.PRIVATE)
    private ClubHeroActivity(Club club, ClubPhoto clubPhoto, String title,
                             String description, int displayOrder) {
        this.club = club;
        this.clubPhoto = clubPhoto;
        this.title = title;
        this.description = description;
        this.displayOrder = displayOrder;
    }

    public static ClubHeroActivity create(Club club, ClubPhoto clubPhoto, String title,
                                          String description, int displayOrder) {
        return ClubHeroActivity.builder()
                .club(club)
                .clubPhoto(clubPhoto)
                .title(title)
                .description(description)
                .displayOrder(displayOrder)
                .build();
    }

    /** 부분 수정 — null 은 미변경. */
    public void updateContent(String title, String description) {
        if (title != null) {
            this.title = title;
        }
        if (description != null) {
            this.description = description;
        }
    }

    public void changePhoto(ClubPhoto clubPhoto) {
        this.clubPhoto = clubPhoto;
    }

    public void changeDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
