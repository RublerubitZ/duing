package com.duing.domain.club.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * "비공개 동아리는 존재를 숨긴다(404)" 규칙의 정의를 고정한다.
 * ClubVisibilityPolicy 의 existsByIdAndStatus(ACTIVE) 게이트와 네이티브 SQL 'ACTIVE' 리터럴이
 * 이 정의와 동치라는 전제 위에 있으므로, 노출 상태를 추가·변경하려면 이 테스트가 먼저 깨져야 한다.
 */
class ClubStatusVisibilityTest {

    @ParameterizedTest
    @EnumSource(ClubStatus.class)
    @DisplayName("학생/공개 경로에는 ACTIVE 동아리만 노출되고 나머지 상태는 존재를 숨긴다")
    void onlyActiveIsPubliclyVisible(ClubStatus status) {
        assertThat(status.isPubliclyVisible()).isEqualTo(status == ClubStatus.ACTIVE);
    }

    @Test
    @DisplayName("네이티브 SQL 의 'ACTIVE' 리터럴(ClubMetricRepository 2곳·RecruitmentRepository 1곳)은 enum 이름과 동기화되어 있다")
    void nativeSqlLiteralStaysInSyncWithEnumName() {
        assertThat(ClubStatus.ACTIVE.name()).isEqualTo("ACTIVE");
    }
}
