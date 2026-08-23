package com.duing.domain.club.service;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.entity.ContactVisibility;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.club.photo.repository.ClubPhotoRepository;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubPhotoQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubViewer;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.RecruitmentDisplayStatus;
import com.duing.domain.recruitment.repository.ClubActiveRecruitmentRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.RecruitmentService;
import com.duing.domain.recruitment.service.dto.query.StudentRecruitmentProjection;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.config.PublicApiCacheConfig;
import com.duing.global.exception.PostgresConstraintViolations;
import com.duing.global.monitoring.event.ClubCreatedEvent;
import com.duing.global.monitoring.event.ClubStatusChangedEvent;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubService implements ClubService {

    // V109 partial unique. (name) WHERE deleted_at IS NULL.
    private static final String CLUB_NAME_UNIQUE_CONSTRAINT = "uk_club_name_active";

    private final ClubRepository clubRepository;
    private final ClubVisibilityPolicy clubVisibilityPolicy;
    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubPhotoRepository clubPhotoRepository;
    private final ClubAuthService clubAuthService;
    private final RecruitmentRepository recruitmentRepository;
    private final RecruitmentService recruitmentService;
    private final ApplicationRepository applicationRepository;
    // 모집 표시 상태(today) 판정용 — KST(seoulClock) 기준.
    private final Clock clock;
    // 운영 Slack 알림용 이벤트 발행 — 커밋 후(AFTER_COMMIT) 비동기로 소비된다(global/monitoring).
    private final ApplicationEventPublisher eventPublisher;

    @Override
    @Transactional
    public Long create(CreateClubCommand createClubCommand) {
        if (clubRepository.existsByName(createClubCommand.name())) {
            throw new ClubException.DuplicateClubNameException();
        }
        User leader = userRepository.findById(createClubCommand.leaderId())
                .orElseThrow(UserException.UserNotFoundException::new);

        String division = createClubCommand.division() == null ? null : createClubCommand.division().strip();
        if (division != null && division.isEmpty()) division = null;
        Club club = Club.create(
                createClubCommand.name(),
                createClubCommand.category(),
                division,
                createClubCommand.description(),
                createClubCommand.logoUrl(),
                createClubCommand.centralClub(),
                createClubCommand.college(),
                createClubCommand.department()
        );
        Club savedClub;
        try {
            savedClub = clubRepository.save(club);
            clubRepository.flush();
        } catch (DataIntegrityViolationException racedInsertion) {
            if (!PostgresConstraintViolations.isUniqueViolationOf(racedInsertion, CLUB_NAME_UNIQUE_CONSTRAINT)) {
                throw racedInsertion;
            }
            // 동시 등록이 선조회를 함께 통과한 경합 — 사전 검사와 같은 409 로 표면화한다.
            throw new ClubException.DuplicateClubNameException();
        }

        // 동아리 생성과 동시에 designated leader 를 ClubMember(LEADER) 로 자동 등록.
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));

        eventPublisher.publishEvent(new ClubCreatedEvent(savedClub.getId(), savedClub.getName(), leader.getId()));
        return savedClub.getId();
    }

    /**
     * 공개 목록 조회 — 응답이 요청자와 무관하므로(찜 필터 제외) 결과를 짧게 공유 캐시한다.
     * 캐시 키는 검색 조건 + 페이지 전체라 쿼리 파라미터가 하나라도 다르면 다른 엔트리가 된다.
     * 찜 필터(favoriteUserId != null)는 사용자별 결과이므로 캐시에서 읽지도, 쓰지도 않는다 —
     * 컨트롤러가 같은 이유로 no-store 를 내려보내는 것과 같은 경계다.
     * 캐시 히트 1회당 count·목록·대표모집 3개 쿼리가 사라진다.
     */
    @Override
    @Cacheable(cacheNames = PublicApiCacheConfig.CLUB_SEARCH_CACHE,
            condition = "#condition.favoriteUserId() == null")
    public Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable) {
        Page<ClubSummaryQuery> clubPage = clubRepository.findByCondition(condition, pageable);
        List<ClubSummaryQuery> summaries = clubPage.getContent();
        if (summaries.isEmpty()) {
            return clubPage;
        }

        List<Long> clubIds = summaries.stream().map(ClubSummaryQuery::id).toList();
        LocalDate today = LocalDate.now(clock);
        Map<Long, ClubActiveRecruitmentRow> representativeByClubId =
                recruitmentRepository.findRepresentativeByClubIds(clubIds, today);

        return clubPage.map(summary -> {
            ClubActiveRecruitmentRow row = representativeByClubId.get(summary.id());
            if (row == null) {
                return summary;
            }
            RecruitmentDisplayStatus displayStatus = RecruitmentDisplayStatus.resolve(
                    row.status(), row.startDate(), row.endDate(), today);
            return summary.withActiveRecruitment(new ClubSummaryQuery.ActiveRecruitmentSummary(
                    row.recruitmentId(), displayStatus, row.startDate(), row.endDate()));
        });
    }

    @Override
    public Page<AdminClubSummaryQuery> searchForAdmin(AdminClubSearchCondition condition, Pageable pageable) {
        return clubRepository.findByAdminCondition(condition, pageable);
    }

    @Override
    public ClubDetailQuery getById(Long clubId, ClubViewer viewer) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        return toDetailQuery(club, viewer);
    }

    @Override
    public ClubDetailQuery getActiveById(Long clubId, ClubViewer viewer) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        clubVisibilityPolicy.requirePubliclyVisible(club);
        return toDetailQuery(club, viewer);
    }

    private ClubDetailQuery toDetailQuery(Club club, ClubViewer viewer) {
        Long clubId = club.getId();
        List<ClubPhotoQuery> photos = clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId)
                .stream()
                .map(ClubPhotoQuery::from)
                .toList();

        LocalDate today = LocalDate.now(clock);
        // 목록 카드와 같은 대표 모집 선정 규칙을 쓴다 — 진행 중인 모집이 없으면 가장 최근 마감 모집을
        // 내려보낸다. 목록이 "모집마감" 칩을 띄우는데 상세는 "현재 모집 없음"이라 답하던 불일치를
        // 없애기 위해서다(#895). 화면은 마감 상태를 이미 표시할 줄 알고, 지원 버튼은 표기 축
        // (displayStatus) 판정이라 마감 모집에서 열리지 않는다.
        StudentRecruitmentProjection representativeRecruitment = recruitmentRepository
                .findRepresentativeByClubId(clubId, today)
                .map(representative -> {
                    Integer applicantCount = representative.isShowApplicantCount()
                            ? (int) applicationRepository.countByRecruitmentId(representative.getId())
                            : null;
                    return StudentRecruitmentProjection.from(representative, today, applicantCount);
                })
                .orElse(null);

        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(leader -> ClubDetailQuery.of(
                        club, leader.getUser().getId(), leader.getUser().getName(),
                        resolveContactPhone(club, leader.getUser().getPhone(), viewer),
                        photos, representativeRecruitment))
                .orElseGet(() -> ClubDetailQuery.of(
                        club, null, null, null, photos, representativeRecruitment));
    }

    /**
     * 대표 연락처 게이트 (§5.3) — PUBLIC=전체, LOGGED_IN_ONLY=로그인, PRIVATE=해당 동아리 임원만.
     * ADMIN 과 임원은 편집 화면 표시용으로 정책 무관 상시 노출. 임원 여부 조회는 PRIVATE+로그인일 때만 발생.
     */
    private String resolveContactPhone(Club club, String leaderPhone, ClubViewer viewer) {
        if (viewer.admin()) return leaderPhone;
        ContactVisibility visibility = club.getContactVisibility();
        if (visibility == ContactVisibility.PUBLIC) return leaderPhone;
        if (viewer.userId() == null) return null;
        if (visibility == ContactVisibility.LOGGED_IN_ONLY) return leaderPhone;
        boolean clubStaff = clubMemberRepository.findByClubIdAndUserId(club.getId(), viewer.userId())
                .map(ClubMember::canManageClub)
                .orElse(false);
        return clubStaff ? leaderPhone : null;
    }

    @Override
    @Transactional
    public void update(UpdateClubCommand updateClubCommand) {
        // 프로필 보완 게이트(D6) — 재심사 보완(PENDING_APPROVAL·REJECTED)을 허용해야 하므로 운영 행위 게이트를 쓰지 않는다.
        clubAuthService.requireEditableClubManager(updateClubCommand.requesterId(), updateClubCommand.clubId());
        applyProfileUpdate(updateClubCommand);
    }

    @Override
    @Transactional
    public void updateAsAdmin(UpdateClubCommand updateClubCommand) {
        // 총동연(ADMIN) 수정 — 웹 계층 @PreAuthorize("hasRole('ADMIN')") 가 권한을 이미 검증한다.
        // 리더 멤버십·동아리 상태 게이트 없이 조회 가능한(soft-delete 되지 않은) 모든 상태의 동아리를 수정한다.
        applyProfileUpdate(updateClubCommand);
    }

    private void applyProfileUpdate(UpdateClubCommand updateClubCommand) {
        Club club = clubRepository.findById(updateClubCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        String newName = updateClubCommand.name();
        if (newName != null && !newName.equals(club.getName())
                && clubRepository.existsByName(newName)) {
            throw new ClubException.DuplicateClubNameException();
        }

        club.update(updateClubCommand.toPayload());
        try {
            // UPDATE 를 지금 내보내 개명 경합을 이 자리에서 분류한다 — 커밋 시점 flush 로 미루면
            // 이 catch 밖(커밋 예외 경유 500)으로 새어 나간다.
            clubRepository.flush();
        } catch (DataIntegrityViolationException racedRename) {
            if (!PostgresConstraintViolations.isUniqueViolationOf(racedRename, CLUB_NAME_UNIQUE_CONSTRAINT)) {
                throw racedRename;
            }
            throw new ClubException.DuplicateClubNameException();
        }
    }

    @Override
    @Transactional
    public void updateStatus(UpdateClubStatusCommand updateClubStatusCommand) {
        // 폐쇄·상태변경 동시 요청이 같은 행을 직렬화하도록 잠금 (stale 검증 방지)
        Club club = clubRepository.findByIdForUpdate(updateClubStatusCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        ClubStatus previousStatus = club.getStatus();
        club.changeStatus(
                updateClubStatusCommand.status(),
                updateClubStatusCommand.rejectionReason(),
                updateClubStatusCommand.actorUserId()
        );
        // 운영 Slack 알림 — 전이가 검증을 통과한 뒤에만(거절 사유는 싣지 않는다).
        eventPublisher.publishEvent(new ClubStatusChangedEvent(
                club.getId(), club.getName(), previousStatus, updateClubStatusCommand.status(),
                updateClubStatusCommand.actorUserId()));
        if (updateClubStatusCommand.status() == ClubStatus.INACTIVE) {
            // 운영 중단 = 신규 모집 활동 정지. OPEN 모집을 일괄 마감해 공개 표면·알림에 남지 않게 한다 (스펙 Part A).
            recruitmentService.closeAllOnClubDeactivation(club.getId());
        }
    }

    @Override
    @Transactional
    public void updateCentralClub(UpdateClubCentralClubCommand command) {
        Club club = clubRepository.findById(command.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.changeCentralClub(command.centralClub());
    }
}
