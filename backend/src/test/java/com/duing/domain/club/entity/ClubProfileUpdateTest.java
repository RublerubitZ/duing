package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubProfileUpdateTest {

    private Club createClub() {
        return Club.create("두잉코드", ClubCategory.ACADEMIC, "학술", "소개", null);
    }

    private Club.UpdatePayload emptyPayload() {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);
    }

    @Test
    @DisplayName("새로 생성된 동아리는 공개 범위 PUBLIC, 회비 NONE(금액 없음), 프로젝트 빈 목록으로 시작한다")
    void defaults() {
        Club club = createClub();
        assertThat(club.getContactVisibility()).isEqualTo(ContactVisibility.PUBLIC);
        assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE);
        assertThat(club.getMembershipFeeAmount()).isNull();
        assertThat(club.getProjects()).isEmpty();
    }

    @Test
    @DisplayName("납부 주기를 NONE 으로 바꾸면 회비 금액이 함께 비워진다")
    void feeCycleNoneClearsAmount() {
        Club club = createClub();
        club.update(payloadWithFee(FeeCycle.SEMESTER, 30000));
        assertThat(club.getMembershipFeeAmount()).isEqualTo(30000);

        club.update(payloadWithFee(FeeCycle.NONE, 30000)); // 금액이 실려 와도 NONE 이면 무시
        assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE);
        assertThat(club.getMembershipFeeAmount()).isNull();
    }

    @Test
    @DisplayName("회비 안내문은 납부 주기와 독립적으로 저장되고, null 은 미변경, 빈 문자열은 null 로 클리어된다")
    void feeNoteIndependentAndBlankCleared() {
        Club club = createClub();
        club.update(payloadWithFeeNote("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원"));
        assertThat(club.getFeeNote()).isEqualTo("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원");
        assertThat(club.getFeeCycle()).isEqualTo(FeeCycle.NONE); // 주기는 건드리지 않는다

        club.update(payloadWithFeeNote(null)); // null = 미변경
        assertThat(club.getFeeNote()).isEqualTo("선수 : 학기당 30,000원\n매니저 : 학기당 15,000원");

        club.update(payloadWithFeeNote("")); // "" = 클리어
        assertThat(club.getFeeNote()).isNull();
    }

    @Test
    @DisplayName("OTHER 가 아닌 SNS 플랫폼의 label 은 저장 시 null 로 정규화된다")
    void snsLabelNormalized() {
        Club club = createClub();
        Club.UpdatePayload payload = payloadWithSns(List.of(
                new ClubSnsLink("INSTAGRAM", "무시될라벨", "https://instagram.com/doing"),
                new ClubSnsLink("OTHER", " GitHub ", "https://github.com/doing")));
        club.update(payload);
        assertThat(club.getSnsLinks().get(0).label()).isNull();
        assertThat(club.getSnsLinks().get(1).label()).isEqualTo("GitHub");
    }

    @Test
    @DisplayName("프로젝트의 부제목이 공백이면 null 로 정규화된다")
    void projectSubtitleNormalized() {
        ClubProject project = new ClubProject(ProjectIcon.CODE, " 알고리즘 스터디 ", "  ");
        assertThat(project.title()).isEqualTo("알고리즘 스터디");
        assertThat(project.subtitle()).isNull();
    }

    // ---- payload helpers: 아래 헬퍼들은 emptyPayload() 와 동일한 26개 인자 순서에서
    //      해당 필드만 채운다. UpdatePayload record 정의의 컴포넌트 순서를 따를 것.
    private Club.UpdatePayload payloadWithFee(FeeCycle feeCycle, Integer amount) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                feeCycle, amount, null, null, null, null, null, null, null, null);
    }

    private Club.UpdatePayload payloadWithSns(List<ClubSnsLink> snsLinks) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, snsLinks, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null);
    }

    private Club.UpdatePayload payloadWithFeeNote(String feeNote) {
        return new Club.UpdatePayload(
                null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, feeNote, null);
    }
}
