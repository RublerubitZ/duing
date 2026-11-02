package com.duing.domain.adminconsole.controller.dto.response;

import com.duing.domain.adminconsole.service.dto.query.AdminClosingRecruitmentsQuery;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(description = "총동연 주간 브리핑 — 이번 주(서버 KST 기준 월~일) 모집 기간이 끝나는 진행 중 모집")
public record AdminClosingRecruitmentsResponse(
        @Schema(description = "서버가 정한 이번 주 월요일(KST 날짜) — 화면 '이번 주 챙길 것'의 기준", example = "2026-11-02")
        LocalDate weekStart,

        @Schema(description = "종료일 오름차순, 같으면 모집 id 순")
        List<ClosingRecruitmentResponse> recruitments
) {

    public static AdminClosingRecruitmentsResponse from(AdminClosingRecruitmentsQuery query) {
        return new AdminClosingRecruitmentsResponse(query.weekStart(),
                query.recruitments().stream()
                        .map(row -> ClosingRecruitmentResponse.from(row, query.today()))
                        .toList());
    }

    /**
     * {@code status} 와 {@code displayStatus} 를 함께 내린다(AdminRecruitmentSummaryResponse 와 같은 쌍) — 화면의 '기간 종료' 칩은
     * 저장 상태 OPEN 인데 표시 상태가 CLOSED 인 줄이다. 서버 오늘로 판정해 화면이 기기 날짜로 종료일을 비교하지 않게 한다(#896).
     */
    @Schema(description = "이번 주 모집 기간이 끝나는 모집 한 줄")
    public record ClosingRecruitmentResponse(
            @Schema(example = "41") Long recruitmentId,
            @Schema(example = "2026 2학기 신입 부원 모집") String title,
            @Schema(example = "7") Long clubId,
            @Schema(example = "두잉밴드") String clubName,
            @Schema(description = "모집 종료일(KST 날짜)", example = "2026-11-06") LocalDate endDate,
            @Schema(description = "저장 상태 — 이 목록은 늘 OPEN", example = "OPEN") RecruitmentStatus status,
            @Schema(description = "표시 상태(서버 오늘 기준). OPEN 인데 CLOSED 면 기간이 지났지만 아직 마감 전 — 화면 '기간 종료' 칩",
                    example = "OPEN")
            RecruitmentDisplayStatus displayStatus,
            ApplicationMode applicationMode,
            @Schema(description = "결과 안 정한 지원 수(제출·보류·면접 대상). 외부 폼은 두잉 지원이 없어 null",
                    nullable = true, example = "12")
            Long undecidedApplicationCount
    ) {
        static ClosingRecruitmentResponse from(ClosingRecruitmentRow row, LocalDate today) {
            return new ClosingRecruitmentResponse(row.recruitmentId(), row.title(), row.clubId(), row.clubName(),
                    row.endDate(), row.status(), row.displayStatus(today), row.applicationMode(),
                    row.applicationMode() == ApplicationMode.EXTERNAL ? null : row.undecidedApplicationCount());
        }
    }
}
