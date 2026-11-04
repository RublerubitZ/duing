package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.dto.query.AdminClubSignalDetailQuery;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.user.entity.College;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record AdminClubSummaryResponse(
        Long id,
        String name,
        ClubCategory category,
        String division,
        College college,
        String logoUrl,
        ClubStatus status,
        List<String> tags,
        Long leaderId,
        String leaderName,
        String leaderStudentId,
        boolean centralClub,
        boolean facilitySecuredTimeTarget,
        String rejectionReason,
        Instant statusChangedAt,
        String statusChangedByName,
        Instant pendingSince,
        // 운영 중단 행만 숫자(0 포함), 다른 상태는 null — 의미는 AdminClubSummaryQuery 주석.
        Long undecidedApplicationCount,
        Long pendingJoinRequestCount,
        // signal 을 보낸 요청만 객체, 아니면 null 키(동아리 신호 스펙 §6-1).
        SignalDetailResponse signalDetail
) {
    public static AdminClubSummaryResponse from(AdminClubSummaryQuery summaryQuery) {
        return new AdminClubSummaryResponse(
                summaryQuery.id(),
                summaryQuery.name(),
                summaryQuery.category(),
                summaryQuery.division(),
                summaryQuery.college(),
                summaryQuery.logoUrl(),
                summaryQuery.status(),
                summaryQuery.tags(),
                summaryQuery.leaderId(),
                summaryQuery.leaderName(),
                summaryQuery.leaderStudentId(),
                summaryQuery.centralClub(),
                summaryQuery.facilitySecuredTimeTarget(),
                summaryQuery.rejectionReason(),
                TimeMapper.systemWallClockToInstant(summaryQuery.statusChangedAt()),
                summaryQuery.statusChangedByName(),
                TimeMapper.systemWallClockToInstant(summaryQuery.pendingSince()),
                summaryQuery.undecidedApplicationCount(),
                summaryQuery.pendingJoinRequestCount(),
                SignalDetailResponse.from(summaryQuery.signalDetail())
        );
    }

    /** 신호 재료 — 운영진 접속은 Instant, 끝난 날은 KST 날짜 그대로, 신청 시각은 system regime → Instant(TIMEZONE.md). */
    public record SignalDetailResponse(
            Instant operatorsLastActiveAt,
            ResultWaitingDetail resultWaiting,
            JoinRequestWaitingDetail joinRequestWaiting
    ) {
        static SignalDetailResponse from(AdminClubSignalDetailQuery detailQuery) {
            if (detailQuery == null) {
                return null;
            }
            AdminClubSignalDetailQuery.ResultWaiting resultWaiting = detailQuery.resultWaiting();
            AdminClubSignalDetailQuery.JoinRequestWaiting joinRequestWaiting = detailQuery.joinRequestWaiting();
            return new SignalDetailResponse(
                    detailQuery.operatorsLastActiveAt(),
                    resultWaiting == null ? null : new ResultWaitingDetail(resultWaiting.oldestRecruitmentId(),
                            resultWaiting.oldestRecruitmentTitle(), resultWaiting.oldestEndedOn(),
                            resultWaiting.recruitmentCount(), resultWaiting.applicationCount()),
                    joinRequestWaiting == null ? null : new JoinRequestWaitingDetail(joinRequestWaiting.requestCount(),
                            TimeMapper.systemWallClockToInstant(joinRequestWaiting.oldestRequestedAt())));
        }
    }

    /** 이름은 홈 카드와 같다(recruitmentCount·applicationCount) — 최상위 undecidedApplicationCount 와 겹치지 않게. */
    public record ResultWaitingDetail(Long oldestRecruitmentId, String oldestRecruitmentTitle, LocalDate oldestEndedOn,
                                      long recruitmentCount, long applicationCount) {
    }

    public record JoinRequestWaitingDetail(long requestCount, Instant oldestRequestedAt) {
    }
}
