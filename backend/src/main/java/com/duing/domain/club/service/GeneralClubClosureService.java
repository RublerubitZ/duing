package com.duing.domain.club.service;

import com.duing.domain.application.service.ApplicationService;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.clubevent.service.ClubEventService;
import com.duing.domain.clubmember.service.ClubMemberCommandService;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
import com.duing.domain.favorite.service.ClubFavoriteService;
import com.duing.domain.interview.service.InterviewRoundService;
import com.duing.domain.promotion.service.PromotionRequestService;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.recruitment.service.RecruitmentService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubClosureService implements ClubClosureService {

    private final ClubRepository clubRepository;
    private final ClubMemberCommandService clubMemberCommandService;
    private final LeaderSuccessionService leaderSuccessionService;
    private final RecruitmentService recruitmentService;
    private final ApplicationService applicationService;
    private final InterviewRoundService interviewRoundService;
    private final RecertificationRequestService recertificationRequestService;
    private final PromotionService promotionService;
    private final PromotionRequestService promotionRequestService;
    private final ClubEventService clubEventService;
    private final ClubFavoriteService clubFavoriteService;

    @Override
    @Transactional
    public void close(CloseClubCommand command) {
        Long clubId = command.clubId();
        Long actor = command.actorUserId();
        String reason = command.closureReason();

        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.validateClosable();

        // 1. 멤버십 · 위임
        clubMemberCommandService.removeAllOnClubClosure(clubId, actor, reason);
        leaderSuccessionService.cancelPendingOnClubClosure(clubId, actor, reason);

        // 2. 모집 → 지원 → 면접 (모집 id 체인)
        List<Long> recruitmentIds = recruitmentService.closeAllOnClubClosure(clubId);
        applicationService.rejectActiveOnClubClosure(recruitmentIds);
        interviewRoundService.softDeleteAllOnClubClosure(recruitmentIds);

        // 3. 인증 · 홍보 · 이벤트 · 즐겨찾기
        recertificationRequestService.rejectPendingOnClubClosure(clubId, actor, reason);
        promotionService.removeAllOnClubClosure(clubId);
        promotionRequestService.rejectPendingOnClubClosure(clubId, actor, reason);
        clubEventService.removeAllOnClubClosure(clubId);
        clubFavoriteService.removeAllOnClubClosure(clubId);

        // 4. 동아리 soft-delete
        clubRepository.delete(club);
    }
}
