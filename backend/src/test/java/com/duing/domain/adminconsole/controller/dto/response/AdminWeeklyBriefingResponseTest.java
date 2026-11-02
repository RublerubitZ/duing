package com.duing.domain.adminconsole.controller.dto.response;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse.WeeklyFeeResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse.WeeklyFirstAnswerResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse.WeeklyFlowResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse.WeeklyFlowsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse.WeeklyRecruitmentResponse;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FeeActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.FirstAnswer;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.Flow;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.RecruitmentActivity;
import com.duing.domain.adminconsole.service.dto.query.AdminWeeklyBriefingQuery.WeeklyFlows;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AdminWeeklyBriefingResponseTest {

    @Test
    @DisplayName("응답으로 변환할 때 같은 타입 칸이 많아도 칸마다 제자리로 옮긴다 — 모든 칸이 서로 다른 값이라 둘이 뒤바뀌면 깨진다")
    void mapsEveryFieldToItsOwnSlot() {
        LocalDate pendingRecordStartedOn = LocalDate.of(2026, 11, 4);
        // 남은 대기 총합 = 11+…+18 = 116
        AdminWeeklyBriefingQuery query = new AdminWeeklyBriefingQuery(
                new WeeklyFlows(new Flow(1, 2), new Flow(3, 4), new Flow(5, 6), new Flow(7, 8), new Flow(9, 10)),
                AdminPendingCountsQuery.of(11, 12, 13, 14, 15, 16, 17, 18),
                pendingRecordStartedOn,
                new FirstAnswer(21, 22L),
                23,
                new RecruitmentActivity(24, 25, 26),
                new FeeActivity(27, 28, 29, 30, 31),
                32);

        AdminWeeklyBriefingResponse response = AdminWeeklyBriefingResponse.from(query);

        assertThat(response).isEqualTo(new AdminWeeklyBriefingResponse(
                new WeeklyFlowsResponse(new WeeklyFlowResponse(1, 2), new WeeklyFlowResponse(3, 4),
                        new WeeklyFlowResponse(5, 6), new WeeklyFlowResponse(7, 8), new WeeklyFlowResponse(9, 10)),
                new AdminPendingCountsResponse(11, 12, 13, 14, 15, 16, 17, 18, 116),
                pendingRecordStartedOn,
                new WeeklyFirstAnswerResponse(21, 22L),
                23,
                new WeeklyRecruitmentResponse(24, 25, 26),
                new WeeklyFeeResponse(27, 28, 29, 30, 31),
                32));
    }
}
