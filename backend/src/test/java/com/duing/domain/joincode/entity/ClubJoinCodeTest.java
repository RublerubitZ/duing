package com.duing.domain.joincode.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ClubJoinCodeTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 8, 3, 10, 0);

    @Test
    @DisplayName("만료·폐기·소진·모집 마감 중 하나라도 해당하면 사용할 수 없는 코드다")
    void unusableWhenExpiredRevokedExhaustedOrRecruitmentClosed() {
        assertThat(issue(openRecruitment(), 5, NOW.plusDays(30)).isUsable(NOW))
                .as("미폐기·미만료·미소진·모집 OPEN 이면 사용 가능").isTrue();

        assertThat(issue(openRecruitment(), 5, NOW.minusSeconds(1)).isUsable(NOW))
                .as("만료된 코드").isFalse();

        ClubJoinCode revoked = issue(openRecruitment(), 5, NOW.plusDays(30));
        revoked.revoke(NOW);
        assertThat(revoked.isUsable(NOW)).as("폐기된 코드").isFalse();
        assertThat(revoked.isRevoked()).isTrue();

        ClubJoinCode exhausted = issue(openRecruitment(), 1, NOW.plusDays(30));
        exhausted.tryConsume();
        assertThat(exhausted.isUsable(NOW)).as("사용 인원이 소진된 코드").isFalse();

        Recruitment closedRecruitment = openRecruitment();
        closedRecruitment.close();
        assertThat(issue(closedRecruitment, 5, NOW.plusDays(30)).isUsable(NOW))
                .as("귀속 모집이 마감된 코드").isFalse();
    }

    @Test
    @DisplayName("잔여 인원이 남아 있을 때만 사용 인원 차감에 성공한다")
    void tryConsumeRespectsMaxUses() {
        ClubJoinCode joinCode = issue(openRecruitment(), 1, NOW.plusDays(30));

        assertThat(joinCode.tryConsume()).as("잔여 1명 — 첫 차감 성공").isTrue();
        assertThat(joinCode.getUsedCount()).isEqualTo(1);
        assertThat(joinCode.tryConsume()).as("잔여 0명 — 둘째 차감 실패").isFalse();
        assertThat(joinCode.getUsedCount()).as("실패한 차감은 사용 인원을 늘리지 않는다").isEqualTo(1);
    }

    private ClubJoinCode issue(Recruitment recruitment, int maxUses, LocalDateTime expiresAt) {
        return ClubJoinCode.issue(club(), recruitment, "AB12CD", 3, maxUses, expiresAt);
    }

    private Club club() {
        return Club.create("두잉가입코드", ClubCategory.ACADEMIC, "분과", "설명", null);
    }

    private Recruitment openRecruitment() {
        return Recruitment.createWithOptions(club(), "외부 폼 모집", "내용",
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false);
    }
}
