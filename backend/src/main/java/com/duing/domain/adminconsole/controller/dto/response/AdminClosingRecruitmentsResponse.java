package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminClosingRecruitmentsQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(description = "총동연 주간 브리핑 — 이번 주(서버 KST 기준 월~일) 모집 기간이 끝나는 진행 중 모집")
public record AdminClosingRecruitmentsResponse(
        @Schema(description = "서버가 정한 이번 주 월요일(KST 날짜) — 화면 '이번 주 챙길 것'의 기준", example = "2026-11-02")
        LocalDate weekStart,

        @Schema(description = "종료일 오름차순")
        List<ClosingRecruitmentResponse> recruitments
) {

    public static AdminClosingRecruitmentsResponse from(AdminClosingRecruitmentsQuery query) {
        return new AdminClosingRecruitmentsResponse(query.weekStart(),
                query.recruitments().stream().map(ClosingRecruitmentResponse::from).toList());
    }

    @Schema(description = "이번 주 모집 기간이 끝나는 모집 한 줄")
    public record ClosingRecruitmentResponse(
            @Schema(example = "41") Long recruitmentId,
            @Schema(example = "2026 2학기 신입 부원 모집") String title,
            @Schema(example = "7") Long clubId,
            @Schema(example = "두잉밴드") String clubName,
            @Schema(description = "모집 종료일(KST 날짜)", example = "2026-11-06") LocalDate endDate,
            ApplicationMode applicationMode,
            @Schema(description = "결과 안 정한 지원 수(제출·보류·면접 대상). 외부 폼은 두잉 지원이 없어 null",
                    nullable = true, example = "12")
            Long undecidedApplicationCount
    ) {
        static ClosingRecruitmentResponse from(ClosingRecruitmentRow row) {
            return new ClosingRecruitmentResponse(row.recruitmentId(), row.title(), row.clubId(), row.clubName(),
                    row.endDate(), row.applicationMode(),
                    row.applicationMode() == ApplicationMode.EXTERNAL ? null : row.undecidedApplicationCount());
        }
    }
}
