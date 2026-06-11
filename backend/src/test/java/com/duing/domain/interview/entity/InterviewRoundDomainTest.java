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

    @Test
    @DisplayName("준비 중(DRAFT) 라운드는 마감이 미래로 설정돼 있으면 응답 수집을 시작할 수 있다")
    void draftRoundOpensCollecting() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        round.openCollecting(LocalDateTime.now());

        assertThat(round.getStatus()).isEqualTo(RoundStatus.COLLECTING);
    }

    @Test
    @DisplayName("마감 시각이 정해지지 않은 라운드는 발송할 수 없다")
    void openCollectingRequiresDeadline() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접", null, null);

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now()))
                .isInstanceOf(InterviewException.AvailabilityDeadlineRequired.class);
    }

    @Test
    @DisplayName("마감 시각이 이미 지난 라운드는 발송할 수 없다 — 생성 후 시간이 흐른 경우의 재검증")
    void openCollectingRejectsPastDeadline() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now().plusDays(8)))
                .isInstanceOf(InterviewException.InvalidDeadline.class);
    }

    @Test
    @DisplayName("이미 발송된 라운드는 다시 발송할 수 없다")
    void openCollectingRequiresDraftStatus() {
        InterviewRound round = InterviewRound.create(1L, "1차 면접",
                LocalDateTime.now().plusDays(7), null);
        round.openCollecting(LocalDateTime.now());

        assertThatThrownBy(() -> round.openCollecting(LocalDateTime.now()))
                .isInstanceOf(InterviewException.RoundTransitionNotAllowed.class);
    }

    @Test
    @DisplayName("초대된 멤버가 슬롯을 선택하면 RESPONDED 가 된다")
    void invitedMemberMarksResponded() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);

        member.markResponded();

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
    }

    @Test
    @DisplayName("가능없음 상태 멤버가 슬롯 선택으로 전환하면 RESPONDED 가 되고 대체 텍스트가 비워진다")
    void noAvailableSlotMemberSwitchesToResponded() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(member, "status", RoundMemberStatus.NO_AVAILABLE_SLOT);
        ReflectionTestUtils.setField(member, "alternativeAvailabilityText", "주말만");

        member.markResponded();

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.RESPONDED);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("초대된 멤버가 가능한 슬롯이 없다고 응답하면 NO_AVAILABLE_SLOT 과 대체 가능시간 텍스트가 기록된다")
    void invitedMemberReportsNoAvailableSlot() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);

        member.reportNoAvailableSlot("  평일 저녁만 가능합니다  ");

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(member.getAlternativeAvailabilityText()).isEqualTo("평일 저녁만 가능합니다");
    }

    @Test
    @DisplayName("응답 완료 멤버는 마감 전 가능없음으로 다시 응답할 수 있다 — 상호 전환")
    void respondedMemberCanSwitchToNoAvailableSlot() {
        InterviewRoundMember member = InterviewRoundMember.invite(1L, 10L);
        member.markResponded();

        member.reportNoAvailableSlot(null);

        assertThat(member.getStatus()).isEqualTo(RoundMemberStatus.NO_AVAILABLE_SLOT);
        assertThat(member.getAlternativeAvailabilityText()).isNull();
    }

    @Test
    @DisplayName("배정 확정·제외된 멤버는 응답을 변경할 수 없다")
    void terminalMembersCannotRespond() {
        InterviewRoundMember assigned = InterviewRoundMember.invite(1L, 10L);
        ReflectionTestUtils.setField(assigned, "status", RoundMemberStatus.ASSIGNED);
        InterviewRoundMember excluded = InterviewRoundMember.invite(1L, 11L);
        ReflectionTestUtils.setField(excluded, "status", RoundMemberStatus.EXCLUDED);

        assertThatThrownBy(assigned::markResponded)
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
        assertThatThrownBy(() -> excluded.reportNoAvailableSlot("아무때나"))
                .isInstanceOf(InterviewException.MemberTransitionNotAllowed.class);
    }
}
