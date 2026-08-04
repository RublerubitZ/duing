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
    private static final Long ISSUER_ID = 7L;

    @Test
    @DisplayName("만료·폐기·소진 중 하나라도 해당하면 사용할 수 없는 코드다")
    void unusableWhenExpiredRevokedOrExhausted() {
        assertThat(issue(openRecruitment(), 5, NOW.plusDays(30)).isUsable(NOW))
                .as("미폐기·미만료·미소진이면 사용 가능").isTrue();

        assertThat(issue(openRecruitment(), 5, NOW.minusSeconds(1)).isUsable(NOW))
                .as("만료된 코드").isFalse();

        ClubJoinCode revoked = issue(openRecruitment(), 5, NOW.plusDays(30));
        revoked.revoke(NOW, ISSUER_ID);
        assertThat(revoked.isUsable(NOW)).as("폐기된 코드").isFalse();
        assertThat(revoked.isRevoked()).isTrue();

        ClubJoinCode exhausted = issue(openRecruitment(), 1, NOW.plusDays(30));
        exhausted.tryConsume();
        assertThat(exhausted.isUsable(NOW)).as("사용 인원이 소진된 코드").isFalse();
    }

    @Test
    @DisplayName("귀속 모집이 마감돼도 이미 발급된 코드는 계속 사용할 수 있다")
    void closedRecruitmentKeepsCodeUsable() {
        Recruitment closedRecruitment = openRecruitment();
        closedRecruitment.close();

        assertThat(issue(closedRecruitment, 5, NOW.plusDays(30)).isUsable(NOW))
                .as("발급만 모집 진행 중으로 제한한다 — 발급된 링크는 자체 만료까지 유효하다")
                .isTrue();
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

    @Test
    @DisplayName("거절로 환급하면 사용 인원이 되돌아가고 0 아래로는 내려가지 않는다")
    void releaseUseNeverGoesBelowZero() {
        ClubJoinCode joinCode = issue(openRecruitment(), 2, NOW.plusDays(30));
        joinCode.tryConsume();

        joinCode.releaseUse();
        assertThat(joinCode.getUsedCount()).as("환급으로 자리가 다시 열린다").isZero();
        assertThat(joinCode.isUsable(NOW)).as("소진됐던 코드도 환급 후 다시 쓸 수 있다").isTrue();

        joinCode.releaseUse();
        assertThat(joinCode.getUsedCount()).as("이미 0 이면 더 내려가지 않는다").isZero();
    }

    private ClubJoinCode issue(Recruitment recruitment, int maxUses, LocalDateTime expiresAt) {
        return ClubJoinCode.issue(club(), recruitment, "AB12CD", 3, maxUses, expiresAt, ISSUER_ID);
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
