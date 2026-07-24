package com.duing.domain.club.heroactivity.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.photo.entity.ClubPhoto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubHeroActivityTest {

    private ClubHeroActivity createHeroActivity() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto photo = ClubPhoto.create(club, "key.jpg", "캡션", 100, 100, 1);
        return ClubHeroActivity.create(club, photo, "제목", "내용", 1);
    }

    @Test
    @DisplayName("updateContent 에 null 을 주면 해당 필드는 변경되지 않는다")
    void updateContentNullKeepsField() {
        ClubHeroActivity heroActivity = createHeroActivity();

        heroActivity.updateContent(null, null);

        assertThat(heroActivity.getTitle()).isEqualTo("제목");
        assertThat(heroActivity.getDescription()).isEqualTo("내용");
    }

    @Test
    @DisplayName("updateContent 는 null 이 아닌 필드만 부분 변경한다")
    void updateContentPartialChange() {
        ClubHeroActivity heroActivity = createHeroActivity();

        heroActivity.updateContent("새 제목", null);

        assertThat(heroActivity.getTitle()).isEqualTo("새 제목");
        assertThat(heroActivity.getDescription()).isEqualTo("내용");
    }

    @Test
    @DisplayName("changePhoto 는 참조 활동사진을 교체한다")
    void changePhotoReplacesReference() {
        ClubHeroActivity heroActivity = createHeroActivity();
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "분과", "설명", null);
        ClubPhoto newPhoto = ClubPhoto.create(club, "new.jpg", "새 캡션", 200, 200, 2);

        heroActivity.changePhoto(newPhoto);

        assertThat(heroActivity.getClubPhoto()).isSameAs(newPhoto);
    }

    @Test
    @DisplayName("changeDisplayOrder 는 노출 순서만 변경한다")
    void changeDisplayOrderChangesSlot() {
        ClubHeroActivity heroActivity = createHeroActivity();

        heroActivity.changeDisplayOrder(4);

        assertThat(heroActivity.getDisplayOrder()).isEqualTo(4);
        assertThat(heroActivity.getTitle()).isEqualTo("제목");
    }
}
