package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.service.dto.command.UpdateMemberGenerationCommand;

/**
 * 멤버 기수 수정 요청. generation 은 null 허용 — null 이면 기수를 비운다(클리어).
 * 값이 있으면 ≥1 검증은 서비스 레이어에서 수행한다.
 */
public record UpdateMemberGenerationRequest(
        Integer generation
) {
    public UpdateMemberGenerationCommand toCommand(Long clubId, Long memberId, Long requesterId) {
        return new UpdateMemberGenerationCommand(clubId, memberId, requesterId, generation);
    }
}
