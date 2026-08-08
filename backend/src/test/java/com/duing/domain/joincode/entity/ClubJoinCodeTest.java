package com.duing.domain.joincode.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ClubJoinCodeTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 10, 0);
    private static final Long ISSUER_ID = 7L;
    private static final int DEFAULT_WINDOW_DAYS = 7;

    @Test
    @DisplayName("폐기·소진 중 하나라도 해당하면 모집이 진행 중이어도 사용할 수 없는 코드다")
    void unusableWhenRevokedOrExhausted() {
        assertThat(issue(openRecruitment(), 5, DEFAULT_WINDOW_DAYS).isUsable(NOW))
                .as("미폐기·미소진 + 모집 진행 중이면 사용 가능").isTrue();

        ClubJoinCode revoked = issue(openRecruitment(), 5, DEFAULT_WINDOW_DAYS);
        revoked.revoke(NOW, ISSUER_ID);
        assertThat(revoked.isUsable(NOW)).as("폐기된 코드").isFalse();
        assertThat(revoked.isRevoked()).isTrue();

        ClubJoinCode exhausted = issue(openRecruitment(), 1, DEFAULT_WINDOW_DAYS);
        exhausted.tryConsume();
        assertThat(exhausted.isUsable(NOW)).as("사용 인원이 소진된 코드").isFalse();
    }

    @Test
    @DisplayName("모집 종료 후에는 종료 시각으로부터 프리셋 기간 안에서만 쓸 수 있다")
    void joinWindowStartsFromActualCloseTime() {
        Recruitment recruitment = openRecruitment();
        // 영속화하지 않는 단위 테스트라 id 가 비어 있다 — 단언이 공허해지지 않게 발급 전에 채워 둔다.
        ReflectionTestUtils.setField(recruitment, "id", 42L);
        ClubJoinCode joinCode = issue(recruitment, 5, DEFAULT_WINDOW_DAYS);
        assertThat(joinCode.isClubInvite()).as("모집에 귀속된 링크는 부원 초대 링크가 아니다").isFalse();
        assertThat(joinCode.getRecruitmentIdOrNull())
                .as("모집 링크는 귀속 모집 id 를 그대로 돌려준다").isEqualTo(42L);
        recruitment.close(NOW);

        assertThat(joinCode.isUsable(NOW.plusDays(7)))
                .as("종료 후 7일째 정각까지는 유효 — 경계는 포함").isTrue();
        assertThat(joinCode.isUsable(NOW.plusDays(7).plusSeconds(1)))
                .as("프리셋을 1초라도 넘기면 사용 불가").isFalse();
        assertThat(joinCode.getJoinExpiresAt())
                .as("기한은 설정 마감일이 아니라 실제 종료 시각 기준이다").isEqualTo(NOW.plusDays(7));
    }

    @Test
    @DisplayName("가입 가능 기간을 모집 종료일까지로 잡으면 종료 즉시 사용할 수 없다")
    void zeroJoinWindowEndsAtClose() {
        Recruitment recruitment = openRecruitment();
        ClubJoinCode joinCode = issue(recruitment, 5, 0);

        assertThat(joinCode.isUsable(NOW)).as("종료 전에는 사용 가능").isTrue();

        recruitment.close(NOW);
        assertThat(joinCode.isUsable(NOW.plusSeconds(1))).as("종료 직후부터 사용 불가").isFalse();
    }

    @Test
    @DisplayName("모집이 진행 중이면 마감일이 없는 상시모집에서도 코드를 계속 쓸 수 있다")
    void alwaysOpenRecruitmentKeepsCodeUsable() {
        ClubJoinCode joinCode = issue(alwaysOpenRecruitment(), 5, DEFAULT_WINDOW_DAYS);

        assertThat(joinCode.isUsable(NOW.plusYears(1)))
                .as("종료 시점이 없으므로 OPEN 동안은 기간 제한이 없다").isTrue();
        assertThat(joinCode.getJoinExpiresAt()).as("진행 중에는 기한이 정해지지 않는다").isNull();
    }

    @Test
    @DisplayName("종료 시각이 기록되지 않은 마감 모집의 코드는 사용할 수 없다")
    void closedWithoutStampIsUnusable() throws Exception {
        Recruitment recruitment = openRecruitment();
        ClubJoinCode joinCode = issue(recruitment, 5, DEFAULT_WINDOW_DAYS);
        forceClosedWithoutStamp(recruitment);

        assertThat(joinCode.isUsable(NOW))
                .as("기준점이 없으면 기간을 계산할 수 없다 — 무기한 사용 대신 막는다(fail-closed)").isFalse();
        assertThat(joinCode.getJoinExpiresAt()).isNull();
    }

    @Test
    @DisplayName("잔여 인원이 남아 있을 때만 사용 인원 차감에 성공한다")
    void tryConsumeRespectsMaxUses() {
        ClubJoinCode joinCode = issue(openRecruitment(), 1, DEFAULT_WINDOW_DAYS);

        assertThat(joinCode.tryConsume()).as("잔여 1명 — 첫 차감 성공").isTrue();
        assertThat(joinCode.getUsedCount()).isEqualTo(1);
        assertThat(joinCode.tryConsume()).as("잔여 0명 — 둘째 차감 실패").isFalse();
        assertThat(joinCode.getUsedCount()).as("실패한 차감은 사용 인원을 늘리지 않는다").isEqualTo(1);
    }

    @Test
    @DisplayName("거절로 환급하면 사용 인원이 되돌아가고 0 아래로는 내려가지 않는다")
    void releaseUseNeverGoesBelowZero() {
        ClubJoinCode joinCode = issue(openRecruitment(), 2, DEFAULT_WINDOW_DAYS);
        joinCode.tryConsume();

        joinCode.releaseUse();
        assertThat(joinCode.getUsedCount()).as("환급으로 자리가 다시 열린다").isZero();
        assertThat(joinCode.isUsable(NOW)).as("소진됐던 코드도 환급 후 다시 쓸 수 있다").isTrue();

        joinCode.releaseUse();
        assertThat(joinCode.getUsedCount()).as("이미 0 이면 더 내려가지 않는다").isZero();
    }

    @Nested
    class 부원_초대_링크 {
        private final LocalDateTime issuedAt = LocalDateTime.of(2026, 1, 1, 12, 0);

        private ClubJoinCode inviteCode(LocalDateTime inviteExpiresAt) {
            return ClubJoinCode.issueClubInvite(club(), "ABC234", null, 40, inviteExpiresAt, false, 1L);
        }

        @Test
        @DisplayName("부원 초대 링크는 만료 시각 전까지 사용 가능하고 만료 시각이 지나면 사용 불가다")
        void inviteExpiryBoundary() {
            ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
            assertThat(joinCode.isUsable(issuedAt.plusHours(24))).as("경계는 포함").isTrue();
            assertThat(joinCode.isUsable(issuedAt.plusHours(24).plusSeconds(1)))
                    .as("1초라도 넘기면 사용 불가").isFalse();
        }

        @Test
        @DisplayName("부원 초대 링크의 가입 가능 기한은 모집이 아닌 절대 만료 시각에서 나온다")
        void joinExpiresAtIsInviteExpiresAt() {
            assertThat(inviteCode(issuedAt.plusHours(72)).getJoinExpiresAt())
                    .isEqualTo(issuedAt.plusHours(72));
        }

        @Test
        @DisplayName("폐기된 부원 초대 링크는 만료 전이라도 사용 불가다")
        void revokedInviteIsUnusable() {
            ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
            joinCode.revoke(issuedAt.plusHours(1), 1L);
            assertThat(joinCode.isUsable(issuedAt.plusHours(2))).isFalse();
        }

        @Test
        @DisplayName("인원이 소진된 부원 초대 링크는 만료 전이라도 사용 불가다")
        void exhaustedInviteIsUnusable() {
            ClubJoinCode joinCode = ClubJoinCode.issueClubInvite(club(), "ABC234", null, 1,
                    issuedAt.plusHours(24), false, 1L);
            assertThat(joinCode.tryConsume()).isTrue();
            assertThat(joinCode.isUsable(issuedAt.plusHours(2))).isFalse();
        }

        @Test
        @DisplayName("부원 초대 링크는 귀속 모집이 없고 recruitment id 는 null 로 조회된다")
        void inviteHasNoRecruitment() {
            ClubJoinCode joinCode = inviteCode(issuedAt.plusHours(24));
            assertThat(joinCode.isClubInvite()).isTrue();
            assertThat(joinCode.getRecruitmentIdOrNull()).isNull();
        }

        @Test
        @DisplayName("자동 승인으로 발급한 부원 초대 링크는 자동 승인 여부를 그대로 들고 있다")
        void autoApproveIsKept() {
            ClubJoinCode autoApproved = ClubJoinCode.issueClubInvite(club(), "ABC234", 12, 40,
                    issuedAt.plusHours(24), true, 1L);
            assertThat(autoApproved.isAutoApprove()).isTrue();
            assertThat(autoApproved.getGeneration()).as("기수는 초대 링크에서도 선택 항목이다").isEqualTo(12);
            assertThat(inviteCode(issuedAt.plusHours(24)).isAutoApprove())
                    .as("기본은 운영진 승인").isFalse();
        }
    }

    private ClubJoinCode issue(Recruitment recruitment, int maxUses, int joinWindowDays) {
        return ClubJoinCode.issue(club(), recruitment, "AB12CD", 3, maxUses, joinWindowDays, ISSUER_ID);
    }

    private Club club() {
        return Club.create("두잉가입코드", ClubCategory.ACADEMIC, "분과", "설명", null);
    }

    private Recruitment openRecruitment() {
        return recruitment(LocalDate.of(2026, 8, 31));
    }

    /** 상시모집 — 마감일이 없어 종료 시점도 없다. */
    private Recruitment alwaysOpenRecruitment() {
        return recruitment(null);
    }

    private Recruitment recruitment(LocalDate endDate) {
        return Recruitment.createWithOptions(club(), "외부 폼 모집", "내용",
                LocalDate.of(2026, 8, 1), endDate, 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false);
    }

    /** 스탬프 이전에 마감된 레거시 행을 재현한다 — 도메인 경로로는 만들 수 없는 상태다. */
    private void forceClosedWithoutStamp(Recruitment recruitment) throws Exception {
        Field statusField = Recruitment.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(recruitment, RecruitmentStatus.CLOSED);
    }
}
