package com.duing.domain.clubmember.service;

import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.clubmember.service.dto.command.RemoveMemberCommand;
import com.duing.domain.clubmember.service.dto.command.TransferLeaderCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberGenerationCommand;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import com.duing.domain.clubmember.service.dto.query.TransferLeaderQuery;

public interface ClubMemberCommandService {

    void updateRole(UpdateMemberRoleCommand command);

    void updateGeneration(UpdateMemberGenerationCommand command);

    void removeMember(RemoveMemberCommand command);

    void leave(LeaveClubCommand command);

    TransferLeaderQuery transferLeader(TransferLeaderCommand command);

    void removeAllOnClubClosure(Long clubId, Long actorUserId, String reason);

    /** 계정 탈퇴 시 그 회원의 활성 멤버십 전부를 LEFT 이력과 함께 soft-delete 한다. 회장 멤버십이 남아 있으면 거부. */
    void leaveAllOnWithdrawal(Long userId);
}