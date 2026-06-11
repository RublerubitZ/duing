package com.duing.domain.interview.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.interview.exception.InterviewException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class InterviewRoundDomainTest {

    @Test
    @DisplayName("요청 회차는 0 에서 시작해 발동마다 1 씩 증가한다")
    void requestSequenceStartsAtZeroAndIncreases() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        assertThat(round.getRequestSequence()).isZero();
        round.increaseRequestSequence();
        round.increaseRequestSequence();
        assertThat(round.getRequestSequence()).isEqualTo(2);
    }

    @Test
    @DisplayName("가능 슬롯이 없다고 응답했던 멤버는 추가 슬롯 생성 시 INVITED 로 복귀하고 대체 가능시간 텍스트가 비워진다")
    void noAvailableSlotMemberIsReinvitedWithClearedText() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.NO_AVAILABLE_SLOT);
        ReflectionTestUtils.setField(member, "alternativeAvailabilityText", "주말만 가능합니다");

        member.reinviteAfterSlotAdded();

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.INVITED);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("가능 슬롯 없음 상태가 아닌 멤버를 복귀시키려 하면 예외가 발생한다")
    void reinviteRequiresNoAvailableSlotStatus() {
        InterviewRoundMember invited = InterviewRoundMember.invite(1L, 10L);

        assertThatThrownBy(invited::reinviteAfterSlotAdded)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
}
