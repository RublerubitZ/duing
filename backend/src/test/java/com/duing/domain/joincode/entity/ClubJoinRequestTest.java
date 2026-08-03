package com.duing.domain.joincode.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.joincode.exception.JoinRequestException;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.user.entity.User;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubJoinRequestTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 10, 0);

    @Test
    @DisplayName("요청 생성 시 코드의 기수가 스냅샷으로 저장된다")
    void pendingSnapshotsJoinCodeGeneration() {
        ClubJoinRequest joinRequest = pendingRequest(12);

        assertThat(joinRequest.getStatus()).isEqualTo(JoinRequestStatus.PENDING);
        assertThat(joinRequest.isPending()).isTrue();
        assertThat(joinRequest.getGeneration()).as("코드의 기수를 그대로 스냅샷").isEqualTo(12);
        assertThat(joinRequest.getReviewedBy()).isNull();
        assertThat(joinRequest.getReviewedAt()).isNull();
        assertThat(joinRequest.getRejectReason()).isNull();

        assertThat(pendingRequest(null).getGeneration()).as("기수 미지정 코드는 null 스냅샷").isNull();
    }

    @Test
    @DisplayName("대기 중인 요청만 승인·거절할 수 있다")
    void onlyPendingRequestCanBeProcessed() {
        User reviewer = UserFixture.unique();

        ClubJoinRequest approved = pendingRequest(12);
        approved.approve(reviewer, NOW);
        assertThat(approved.getStatus()).isEqualTo(JoinRequestStatus.APPROVED);
        assertThat(approved.getReviewedBy()).isSameAs(reviewer);
        assertThat(approved.getReviewedAt()).isEqualTo(NOW);
        assertThat(approved.isPending()).isFalse();
        assertThatThrownBy(() -> approved.approve(reviewer, NOW.plusMinutes(1)))
                .as("이미 처리된 요청 재승인").isInstanceOf(JoinRequestException.AlreadyProcessedException.class);
        assertThatThrownBy(() -> approved.reject(reviewer, NOW.plusMinutes(1)))
                .as("이미 처리된 요청 거절").isInstanceOf(JoinRequestException.AlreadyProcessedException.class);

        ClubJoinRequest rejected = pendingRequest(12);
        rejected.reject(reviewer, NOW);
        assertThat(rejected.getStatus()).isEqualTo(JoinRequestStatus.REJECTED);
        assertThat(rejected.getRejectReason()).as("운영진 수동 거절은 사유를 남기지 않는다").isNull();
        assertThatThrownBy(() -> rejected.approve(reviewer, NOW.plusMinutes(1)))
                .isInstanceOf(JoinRequestException.AlreadyProcessedException.class);
    }

    @Test
    @DisplayName("이미 가입된 회원의 요청은 사유가 기록된 채 자동 거절된다")
    void rejectAutomaticallyRecordsReason() {
        User reviewer = UserFixture.unique();
        ClubJoinRequest joinRequest = pendingRequest(12);

        joinRequest.rejectAutomatically(reviewer, NOW);

        assertThat(joinRequest.getStatus()).isEqualTo(JoinRequestStatus.REJECTED);
        assertThat(joinRequest.getRejectReason()).isEqualTo("이미 가입된 회원");
        assertThat(joinRequest.getReviewedBy()).isSameAs(reviewer);
        assertThat(joinRequest.getReviewedAt()).isEqualTo(NOW);
    }

    private ClubJoinRequest pendingRequest(Integer generation) {
        Club club = club();
        ClubJoinCode joinCode = ClubJoinCode.issue(
                club, openRecruitment(club), "AB12CD", generation, 30, NOW.plusDays(30));
        return ClubJoinRequest.pending(club, UserFixture.unique(), joinCode);
    }

    private Club club() {
        return Club.create("두잉가입요청", ClubCategory.ACADEMIC, "분과", "설명", null);
    }

    private Recruitment openRecruitment(Club club) {
        return Recruitment.createWithOptions(club, "외부 폼 모집", "내용",
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false);
    }
}
