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
import jakarta.persistence.EntityManager;
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
    private final PromotionService promotionService;
    private final PromotionRequestService promotionRequestService;
    private final ClubEventService clubEventService;
    private final ClubFavoriteService clubFavoriteService;
    private final EntityManager entityManager;

    @Override
    @Transactional
    public void close(CloseClubCommand command) {
        Long clubId = command.clubId();
        Long actorAdminUserId = command.actorUserId();
        String reason = command.closureReason();

        // 폐쇄·상태변경 동시 요청이 같은 행을 직렬화하도록 잠금 (stale 검증 방지)
        Club club = clubRepository.findByIdForUpdate(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.validateClosable();

        // 1. 멤버십 · 위임
        clubMemberCommandService.removeAllOnClubClosure(clubId, actorAdminUserId, reason);
        leaderSuccessionService.cancelPendingOnClubClosure(clubId, actorAdminUserId, reason);

        // 2. 모집 → 지원 → 면접 (모집 id 체인)
        // 모집의 soft-delete 는 지원/면접 cascade 가 모집을 참조해 처리할 수 있도록 가장 마지막에 한다.
        // (먼저 삭제하면 @SQLRestriction 으로 모집이 가려져 cascade 가 누락된다.)
        List<Long> recruitmentIds = recruitmentService.closeAllOnClubClosure(clubId);
        applicationService.rejectActiveOnClubClosure(recruitmentIds);
        interviewRoundService.softDeleteAllOnClubClosure(recruitmentIds);
        recruitmentService.softDeleteAllOnClubClosure(recruitmentIds);

        // 3. 홍보 · 이벤트 · 즐겨찾기
        promotionService.removeAllOnClubClosure(clubId);
        promotionRequestService.rejectPendingOnClubClosure(clubId, actorAdminUserId, reason);
        clubEventService.removeAllOnClubClosure(clubId);
        clubFavoriteService.removeAllOnClubClosure(clubId);

        // 4. 동아리 soft-delete
        // Hibernate CHECK_ON_FLUSH 이 단계 2·3 에서 로드된 Recruitment 등의 club 프록시가
        // "DELETED" 상태의 Club 을 참조한다고 판단해 TransientObjectException 을 던지는 것을
        // 방지하기 위해 flush 로 변경분을 먼저 기록한 뒤 session 을 clear 한다.
        entityManager.flush();
        entityManager.clear();
        Club clubToDelete = clubRepository.getReferenceById(club.getId());
        clubRepository.delete(clubToDelete);
    }
}
