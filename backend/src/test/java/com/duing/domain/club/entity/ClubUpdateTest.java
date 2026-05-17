package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubUpdateTest {

    @Test
    @DisplayName("update 는 null 이 아닌 필드만 부분 갱신한다")
    void updatesOnlyNonNullFields() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "원본 설명", "https://logo");

        club.update(
                "두잉 NEW",
                null,
                null,
                null,
                null,
                "https://cover",
                List.of("코딩", "스터디"),
                List.of(new ClubSnsLink("INSTAGRAM", "https://insta")),
                List.of(new ClubFaq("Q1", "A1", 0))
        );

        assertThat(club.getName()).isEqualTo("두잉 NEW");
        assertThat(club.getCategory()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(club.getDivision()).isEqualTo("중앙");
        assertThat(club.getDescription()).isEqualTo("원본 설명");
        assertThat(club.getLogoUrl()).isEqualTo("https://logo");
        assertThat(club.getCoverUrl()).isEqualTo("https://cover");
        assertThat(club.getTags()).containsExactly("코딩", "스터디");
        assertThat(club.getSnsLinks()).hasSize(1);
        assertThat(club.getFaqs()).hasSize(1);
    }

    @Test
    @DisplayName("update 는 tags 중복을 제거한다")
    void dedupesTags() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "설명", "https://logo");

        club.update(null, null, null, null, null, null,
                List.of("코딩", "스터디", "코딩"), null, null);

        assertThat(club.getTags()).containsExactly("코딩", "스터디");
    }

    @Test
    @DisplayName("update 는 모든 인자가 null 이면 기존 값을 유지한다")
    void keepsExistingValuesWhenAllArgsNull() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "설명", "https://logo");

        club.update(null, null, null, null, null, null, null, null, null);

        assertThat(club.getName()).isEqualTo("두잉");
        assertThat(club.getCategory()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(club.getTags()).isEmpty();
        assertThat(club.getSnsLinks()).isEmpty();
        assertThat(club.getFaqs()).isEmpty();
    }
}