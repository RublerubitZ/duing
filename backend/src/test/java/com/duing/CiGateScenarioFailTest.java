package com.duing;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assertions;

/** ci-gate 실패 전파 검증용 임시 테스트 — 병합하지 않는다. */
class CiGateScenarioFailTest {

    @Test
    @DisplayName("게이트가 백엔드 CI 실패를 실패로 전파하는지 확인하기 위해 의도적으로 실패한다")
    void intentionallyFails() {
        Assertions.fail("ci-gate 시나리오 E — 의도적 실패");
    }
}
