package com.duing.domain.club.service;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
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
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralClubService implements ClubService {

    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final ClubMemberRepository clubMemberRepository;
    private final ClubPhotoRepository clubPhotoRepository;
    private final ClubAuthService clubAuthService;
    private final RecruitmentRepository recruitmentRepository;
    private final RecruitmentService recruitmentService;
    private final ApplicationRepository applicationRepository;
    // 모집 표시 상태(today) 판정용 — KST(seoulClock) 기준.
    private final Clock clock;

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
                createClubCommand.college()
        );
        Club savedClub = clubRepository.save(club);

        // 동아리 생성과 동시에 designated leader 를 ClubMember(LEADER) 로 자동 등록.
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));

        return savedClub.getId();
    }

    @Override
    public Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable) {
        Page<Club> clubPage = clubRepository.findByCondition(condition, pageable);
        List<Club> clubs = clubPage.getContent();
        if (clubs.isEmpty()) {
            return clubPage.map(ClubSummaryQuery::from);
        }

        List<Long> clubIds = clubs.stream().map(Club::getId).toList();
        LocalDate today = LocalDate.now(clock);
        Map<Long, ClubActiveRecruitmentRow> representativeByClubId =
                recruitmentRepository.findRepresentativeByClubIds(clubIds, today);

        return clubPage.map(eachClub -> {
            ClubSummaryQuery base = ClubSummaryQuery.from(eachClub);
            ClubActiveRecruitmentRow row = representativeByClubId.get(eachClub.getId());
            if (row == null) {
                return base;
            }
            RecruitmentDisplayStatus displayStatus = RecruitmentDisplayStatus.resolve(
                    row.status(), row.startDate(), row.endDate(), today);
            return base.withActiveRecruitment(new ClubSummaryQuery.ActiveRecruitmentSummary(
                    row.recruitmentId(), displayStatus, row.startDate(), row.endDate()));
        });
    }

    @Override
    public Page<AdminClubSummaryQuery> searchForAdmin(AdminClubSearchCondition condition, Pageable pageable) {
        return clubRepository.findByAdminCondition(condition, pageable);
    }

    @Override
    public ClubDetailQuery getById(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        return toDetailQuery(club);
    }

    @Override
    public ClubDetailQuery getActiveById(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        // 존재 여부를 숨기기 위해 403 이 아닌 404 로 동일하게 응답한다.
        if (club.getStatus() != ClubStatus.ACTIVE) {
            throw new ClubException.ClubNotFoundException();
        }
        return toDetailQuery(club);
    }

    private ClubDetailQuery toDetailQuery(Club club) {
        Long clubId = club.getId();
        List<ClubPhotoQuery> photos = clubPhotoRepository.findByClubIdOrderByDisplayOrderAsc(clubId)
                .stream()
                .map(ClubPhotoQuery::from)
                .toList();

        LocalDate today = LocalDate.now(clock);
        StudentRecruitmentProjection activeRecruitment = recruitmentRepository.findActiveByClubId(clubId)
                .map(active -> {
                    Integer applicantCount = active.isShowApplicantCount()
                            ? (int) applicationRepository.countByRecruitmentId(active.getId())
                            : null;
                    return StudentRecruitmentProjection.from(active, today, applicantCount);
                })
                .orElse(null);

        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(leader -> ClubDetailQuery.of(
                        club, leader.getUser().getId(), leader.getUser().getName(), photos, activeRecruitment))
                .orElseGet(() -> ClubDetailQuery.of(club, null, null, photos, activeRecruitment));
    }

    @Override
    @Transactional
    public void update(UpdateClubCommand updateClubCommand) {
        // 프로필 보완 게이트(D6) — 재심사 보완(PENDING_APPROVAL·REJECTED)을 허용해야 하므로 운영 행위 게이트를 쓰지 않는다.
        clubAuthService.requireEditableClubLeader(updateClubCommand.requesterId(), updateClubCommand.clubId());

        Club club = clubRepository.findById(updateClubCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);

        String newName = updateClubCommand.name();
        if (newName != null && !newName.equals(club.getName())
                && clubRepository.existsByName(newName)) {
            throw new ClubException.DuplicateClubNameException();
        }

        club.update(updateClubCommand.toPayload());
    }

    @Override
    @Transactional
    public void updateStatus(UpdateClubStatusCommand updateClubStatusCommand) {
        // 폐쇄·상태변경 동시 요청이 같은 행을 직렬화하도록 잠금 (stale 검증 방지)
        Club club = clubRepository.findByIdForUpdate(updateClubStatusCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.changeStatus(
                updateClubStatusCommand.status(),
                updateClubStatusCommand.rejectionReason(),
                updateClubStatusCommand.actorUserId()
        );
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
