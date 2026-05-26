package com.duing.domain.clubmember.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.clubmember.exception.ClubMemberException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LeaderSuccessionRequestTest {

    @Test
    @DisplayName("승계 요청 생성 시 기본 상태는 PENDING 이며 처리 정보는 비어 있다")
    void createInitializesPending() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수 3개월");
        assertThat(request.getStatus()).isEqualTo(SuccessionStatus.PENDING);
        assertThat(request.getHandledBy()).isNull();
        assertThat(request.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("처리 시 APPROVED/REJECTED 로만 전이 가능하다")
    void processTransitionsToTerminal() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        request.process(99L, SuccessionStatus.APPROVED, "확인 완료");
        assertThat(request.getStatus()).isEqualTo(SuccessionStatus.APPROVED);
        assertThat(request.getHandledBy()).isEqualTo(99L);
        assertThat(request.getHandledAt()).isNotNull();
        assertThat(request.getActionNote()).isEqualTo("확인 완료");
    }

    @Test
    @DisplayName("이미 종결된 요청을 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        request.process(99L, SuccessionStatus.REJECTED, null);
        assertThatThrownBy(() -> request.process(99L, SuccessionStatus.APPROVED, null))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        LeaderSuccessionRequest request = LeaderSuccessionRequest.create(10L, 1L, "잠수");
        assertThatThrownBy(() -> request.process(99L, SuccessionStatus.PENDING, null))
                .isInstanceOf(ClubMemberException.InvalidSuccessionTransition.class);
    }
}
