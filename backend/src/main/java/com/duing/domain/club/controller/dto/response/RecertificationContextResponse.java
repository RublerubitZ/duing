package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationRound;
import java.time.LocalDateTime;

public record RecertificationContextResponse(
        boolean centralClub,
        Integer lastVerifiedYear,
        OpenRoundView openRound,
        PendingRequestView pendingRequest
) {
    public record OpenRoundView(Long id, int year, String label) {
        public static OpenRoundView from(RecertificationRound round) {
            return new OpenRoundView(round.getId(), round.getYear(), round.getLabel());
        }
    }

    public record PendingRequestView(
            Long id,
            int operatingYear,
            String contactEmail,
            String contactPhone,
            LocalDateTime createdAt
    ) {
        public static PendingRequestView from(RecertificationRequest request) {
            return new PendingRequestView(
                    request.getId(),
                    request.getOperatingYear(),
                    request.getContactEmail(),
                    request.getContactPhone(),
                    request.getCreatedAt()
            );
        }
    }

    public static RecertificationContextResponse of(
            Club club,
            RecertificationRound openRound,
            RecertificationRequest pendingRequest
    ) {
        return new RecertificationContextResponse(
                club.isCentralClub(),
                club.getLastVerifiedYear(),
                openRound == null ? null : OpenRoundView.from(openRound),
                pendingRequest == null ? null : PendingRequestView.from(pendingRequest)
        );
    }
}
