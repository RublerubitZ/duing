package com.duing.global.constant;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 와이어 값 핀 — 백엔드 테스트가 전부 상수를 참조하므로, 상수 값이 잘못 바뀌면 백엔드는 통과하면서
 * FE 리터럴 매칭(closedRecruitment.ts·ApplicantDetailPage)만 조용히 깨진다. 이 핀이 먼저 깨져야 한다.
 * (전례: ClubStatusVisibilityTest 의 네이티브 SQL 'ACTIVE' enum 이름 동기화 핀)
 */
class ErrorCodesTest {

    @Test
    @DisplayName("RECRUITMENT_CLOSED 코드의 와이어 값은 FE 가 리터럴로 매칭하는 계약이라 변경할 수 없다")
    void recruitmentClosedWireValueIsPinned() {
        assertThat(ErrorCodes.RECRUITMENT_CLOSED).isEqualTo("RECRUITMENT_CLOSED");
    }
}
