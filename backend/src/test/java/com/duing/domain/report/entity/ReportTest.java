package com.duing.domain.report.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.report.exception.ReportException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReportTest {

    @Test
    @DisplayName("신고 생성 시 기본 상태는 PENDING 이며 처리 정보는 비어 있다")
    void createInitializesPendingState() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.INAPPROPRIATE, "내용");
        assertThat(report.getStatus()).isEqualTo(ReportStatus.PENDING);
        assertThat(report.getHandledBy()).isNull();
        assertThat(report.getHandledAt()).isNull();
    }

    @Test
    @DisplayName("처리 시 RESOLVED/DISMISSED 로만 전이 가능하다")
    void processTransitionsToTerminal() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        report.process(99L, ReportStatus.RESOLVED, "조치 완료");
        assertThat(report.getStatus()).isEqualTo(ReportStatus.RESOLVED);
        assertThat(report.getHandledBy()).isEqualTo(99L);
        assertThat(report.getHandledAt()).isNotNull();
        assertThat(report.getActionNote()).isEqualTo("조치 완료");
    }

    @Test
    @DisplayName("이미 종결된 신고를 다시 처리하면 예외가 발생한다")
    void processTwiceFails() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        report.process(99L, ReportStatus.DISMISSED, null);
        assertThatThrownBy(() -> report.process(99L, ReportStatus.RESOLVED, null))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }

    @Test
    @DisplayName("PENDING 으로 되돌리는 처리는 거절된다")
    void processToPendingFails() {
        Report report = Report.create(1L, ReportTargetType.CLUB, 10L,
                ReportReasonCode.SPAM, null);
        assertThatThrownBy(() -> report.process(99L, ReportStatus.PENDING, null))
                .isInstanceOf(ReportException.InvalidReportTransitionException.class);
    }
}
