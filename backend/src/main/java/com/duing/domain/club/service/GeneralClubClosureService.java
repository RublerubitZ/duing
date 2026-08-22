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
import com.duing.domain.joincode.service.JoinCodeService;
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
    private final JoinCodeService joinCodeService;
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

        // 2. 모집 → 가입 링크 → 지원 → 면접 (모집 id 체인)
        // 모집의 soft-delete 는 지원/면접 cascade 가 모집을 참조해 처리할 수 있도록 가장 마지막에 한다.
        // (먼저 삭제하면 @SQLRestriction 으로 모집이 가려져 cascade 가 누락된다.)
        List<Long> recruitmentIds = recruitmentService.closeAllOnClubClosure(clubId);
        // 이미 배포된 가입 링크는 회수할 수 없으므로 폐쇄가 서버에서 끊어야 한다 — 폐기하지 않으면
        // 죽은 동아리로 학생이 계속 유입된다(#869).
        //
        // ⚠ 잠금 순서: 이 트랜잭션은 club → club_join_code 순으로 잠그는데, 학생의 가입 요청 생성은
        // club_join_code(FOR UPDATE) → club(FK KEY SHARE) 순이라 정확히 역순이다. 두 트랜잭션이
        // 겹치면 교착이고 폐쇄 쪽이 abort 된다. 겹치지 않는 이유는 잠금이 아니라 상태 게이트다 —
        // 폐쇄는 커밋된 비 ACTIVE 동아리에서만 시작되고(validateClosable), 코드 행을 잠그는 모든
        // 경로가 ACTIVE 를 요구한다(요청 생성의 isUsable, 운영진 경로의 requireActiveClub).
        // ACTIVE 동아리 폐쇄를 허용하거나 그 게이트를 완화하면 이 교착이 곧바로 열린다.
        joinCodeService.revokeActiveOnClubClosure(clubId, recruitmentIds, actorAdminUserId);
        applicationService.rejectActiveOnClubClosure(recruitmentIds, actorAdminUserId);
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
