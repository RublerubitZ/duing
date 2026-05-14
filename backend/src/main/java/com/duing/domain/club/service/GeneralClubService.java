package com.duing.domain.club.service;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.UserRepository;
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

    @Override
    @Transactional
    public Long create(CreateClubCommand createClubCommand) {
        if (clubRepository.existsByName(createClubCommand.name())) {
            throw new ClubException.DuplicateClubNameException();
        }
        User leader = userRepository.findById(createClubCommand.leaderId())
                .orElseThrow(UserException.UserNotFoundException::new);

        Club club = Club.create(
                createClubCommand.name(),
                createClubCommand.category(),
                createClubCommand.division(),
                createClubCommand.description(),
                createClubCommand.logoUrl()
        );
        Club savedClub = clubRepository.save(club);

        // 동아리 생성과 동시에 designated leader 를 ClubMember(LEADER) 로 자동 등록.
        clubMemberRepository.save(ClubMember.asLeader(savedClub, leader));

        return savedClub.getId();
    }

    @Override
    public Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable) {
        return clubRepository.findByCondition(condition, pageable)
                .map(ClubSummaryQuery::from);
    }

    @Override
    public ClubDetailQuery getById(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(ClubException.ClubNotFoundException::new);
        return clubMemberRepository.findFirstByClubIdAndRole(clubId, ClubMemberRole.LEADER)
                .map(leader -> ClubDetailQuery.of(club, leader.getUser().getId(), leader.getUser().getName()))
                .orElseGet(() -> ClubDetailQuery.of(club, null, null));
    }

    @Override
    @Transactional
    public void updateStatus(UpdateClubStatusCommand updateClubStatusCommand) {
        Club club = clubRepository.findById(updateClubStatusCommand.clubId())
                .orElseThrow(ClubException.ClubNotFoundException::new);
        club.changeStatus(updateClubStatusCommand.status());
    }
}
