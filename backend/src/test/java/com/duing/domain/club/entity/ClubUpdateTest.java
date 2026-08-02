package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubUpdateTest {

    // UpdatePayload 컴포넌트(25개) 그룹:
    //  A(1~9)  name, category, division, description, logoUrl, coverUrl, tags, snsLinks, faqs
    //  B(10~16) foundedYear, cohortNumber, location, activityFrequency, activeDays, tagline, highlights
    //  C(17~20) contactVisibility, feeCycle, membershipFeeAmount, projects
    //  D(21~25) college, clearCollege, clearLogoImage, clearCoverImage, useGeneration

    @Test
    @DisplayName("update 는 null 이 아닌 필드만 부분 갱신한다")
    void updatesOnlyNonNullFields() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "원본 설명", "https://logo");

        club.update(new Club.UpdatePayload(
                "두잉 NEW", null, null, null, null, "https://cover",
                List.of("코딩", "스터디"),
                List.of(new ClubSnsLink("INSTAGRAM", null, "https://insta")),
                List.of(new ClubFaq("Q1", "A1", 0)),
                null, null, null, null, null, null, null,   // B
                null, null, null, null,                     // C
                null, null, null, null, null, null                // D
        ));

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

        club.update(new Club.UpdatePayload(
                null, null, null, null, null, null,
                List.of("코딩", "스터디", "코딩"), null, null,
                null, null, null, null, null, null, null,   // B
                null, null, null, null,                     // C
                null, null, null, null, null, null));             // D

        assertThat(club.getTags()).containsExactly("코딩", "스터디");
    }

    @Test
    @DisplayName("update 는 모든 인자가 null 이면 기존 값을 유지한다")
    void keepsExistingValuesWhenAllArgsNull() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "설명", "https://logo");

        club.update(new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,   // A
                null, null, null, null, null, null, null,               // B
                null, null, null, null,                                 // C
                null, null, null, null, null, null));                         // D

        assertThat(club.getName()).isEqualTo("두잉");
        assertThat(club.getCategory()).isEqualTo(ClubCategory.ACADEMIC);
        assertThat(club.getTags()).isEmpty();
        assertThat(club.getSnsLinks()).isEmpty();
        assertThat(club.getFaqs()).isEmpty();
    }

    @Test
    @DisplayName("clearLogoImage/clearCoverImage 가 true 면 로고·커버가 null 로 비워지고 같은 요청의 새 값보다 우선한다")
    void clearsImagesWithPrecedence() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "설명", "https://logo");
        club.update(new Club.UpdatePayload(
                null, null, null, null, null, "https://cover", null, null, null,   // A
                null, null, null, null, null, null, null,                          // B
                null, null, null, null,                                            // C
                null, null, null, null, null, null));                                    // D
        assertThat(club.getCoverUrl()).isEqualTo("https://cover");

        club.update(new Club.UpdatePayload(
                null, null, null, null, "https://new-logo", "https://new-cover", null, null, null,   // A
                null, null, null, null, null, null, null,                                            // B
                null, null, null, null,                                                              // C
                null, null, true, true, null, null));                                                      // D (clearLogoImage/clearCoverImage)

        assertThat(club.getLogoUrl()).isNull();
        assertThat(club.getCoverUrl()).isNull();
    }

    @Test
    @DisplayName("빈 문자열로 텍스트 필드를 비우면 null 로 정규화되어 저장된다")
    void blankTextNormalizedToNull() {
        Club club = Club.create("두잉", ClubCategory.ACADEMIC, "중앙", "원본 설명", "https://logo");

        club.update(new Club.UpdatePayload(
                null, null, null, "", null, null, null, null, null,   // A: description=""
                null, null, "", null, null, null, null,               // B: location=""
                null, null, null, null,                               // C
                null, null, null, null, null, null));                       // D

        assertThat(club.getDescription()).isNull();
        assertThat(club.getLocation()).isNull();
    }
}
