package com.duing.domain.club.photo.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubPhotoUpdateTest {

    @Test
    @DisplayName("updateCaption 은 caption 만 변경하고 displayOrder 는 유지한다")
    void updatesOnlyCaption() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto photo = ClubPhoto.create(club, "key.jpg", "원본 캡션", 100, 100, 5);

        photo.updateCaption("변경된 캡션");

        assertThat(photo.getCaption()).isEqualTo("변경된 캡션");
        assertThat(photo.getDisplayOrder()).isEqualTo(5);
    }

    @Test
    @DisplayName("changeDisplayOrder 는 displayOrder 만 변경한다")
    void updatesOnlyDisplayOrder() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto photo = ClubPhoto.create(club, "key.jpg", "캡션", 100, 100, 5);

        photo.changeDisplayOrder(2);

        assertThat(photo.getDisplayOrder()).isEqualTo(2);
        assertThat(photo.getCaption()).isEqualTo("캡션");
    }
}