package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record RecruitmentSummaryQuery(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        RecruitmentDisplayStatus displayStatus,
        boolean effectivelyOpen,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDateTime closedAt
) {
    /**
     * 공개 목록 경로(스칼라 projection) 전용 — 파생값(displayStatus·effectivelyOpen)은 엔티티와
     * 같은 정적 로직으로 계산한다. 엔티티를 받는 오버로드는 두지 않는다: 목록을 엔티티로 읽는 순간
     * form eager N+1 과 full Club 로드가 조용히 재유입된다(성능 감사 P0-3).
     */
    public static RecruitmentSummaryQuery from(RecruitmentSummaryRow row, LocalDate today) {
        return new RecruitmentSummaryQuery(
                row.id(),
                row.clubId(),
                row.clubName(),
                row.title(),
                row.startDate(),
                row.endDate(),
                row.capacity(),
                row.status(),
                RecruitmentDisplayStatus.resolve(row.status(), row.startDate(), row.endDate(), today),
                Recruitment.isEffectivelyOpen(row.status(), row.endDate(), today),
                row.applicationMode(),
                row.externalFormUrl(),
                row.useInterview(),
                row.targetRole(),
                row.closedAt()
        );
    }

}
