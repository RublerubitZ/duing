package com.duing.domain.fee.service;

import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.fee.entity.AdminFeeAuditComment;
import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.exception.FeeAuditCommentException;
import com.duing.domain.fee.repository.AdminFeeAuditCommentRepository;
import com.duing.domain.fee.service.dto.command.CreateFeeAuditCommentCommand;
import com.duing.domain.fee.service.dto.command.UpdateFeeAuditCommentCommand;
import com.duing.domain.fee.service.dto.query.AdminFeeAuditCommentRow;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 총동연 감사 의견·운영 메모(스펙 §7.10). 권한은 컨트롤러의 {@code @PreAuthorize} 가 담당하고
 * 여기서는 동아리 존재와 대상 소속(IDOR)만 본다 — admin 은 전 동아리 접근이 정당하다.
 *
 * <p>의견·메모는 회비 데이터를 바꾸지 않으므로 감사 로그(club_audit_event)에 남기지 않는다 —
 * 감사자 자신의 기록이라 계측 대상이 아니다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralAdminFeeAuditCommentService implements AdminFeeAuditCommentService {

    private final AdminFeeAuditCommentRepository adminFeeAuditCommentRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public Long create(CreateFeeAuditCommentCommand command) {
        requireExistingClub(command.clubId());
        return adminFeeAuditCommentRepository.save(AdminFeeAuditComment.create(
                        command.clubId(), command.authorUserId(), command.kind(),
                        command.status(), command.content()))
                .getId();
    }

    @Override
    public List<AdminFeeAuditCommentRow> getComments(Long clubId, FeeAuditCommentKind kind) {
        requireExistingClub(clubId);
        List<AdminFeeAuditComment> comments = kind == null
                ? adminFeeAuditCommentRepository.findByClubIdOrderByCreatedAtDescIdDesc(clubId)
                : adminFeeAuditCommentRepository.findByClubIdAndKindOrderByCreatedAtDescIdDesc(clubId, kind);
        Map<Long, String> authorNames = authorNamesOf(comments);
        return comments.stream().map(comment -> toRow(comment, authorNames)).toList();
    }

    @Override
    @Transactional
    public void update(UpdateFeeAuditCommentCommand command) {
        // 검증(메모에 status 금지)은 엔티티가 갖는다 — 생성 경로와 규칙이 갈리지 않게 한 곳에 둔다.
        findOwnedComment(command.clubId(), command.commentId())
                .update(command.content(), command.status());
    }

    @Override
    @Transactional
    public void delete(Long clubId, Long commentId) {
        // @SQLDelete 로 soft delete 된다 — 지운 의견은 목록에서만 사라지고 행은 남는다.
        adminFeeAuditCommentRepository.delete(findOwnedComment(clubId, commentId));
    }

    /** 경로의 동아리에 속한 의견만 집는다 — 남의 commentId 는 403 이 아니라 404 다(존재를 알리지 않는다). */
    private AdminFeeAuditComment findOwnedComment(Long clubId, Long commentId) {
        requireExistingClub(clubId);
        return adminFeeAuditCommentRepository.findByIdAndClubId(commentId, clubId)
                .orElseThrow(FeeAuditCommentException.FeeAuditCommentNotFoundException::new);
    }

    /** 없는(또는 삭제된) 동아리는 빈 목록이 아니라 404 다(스펙 §7.11 — 조회 탭들과 같은 가드). */
    private void requireExistingClub(Long clubId) {
        if (!clubRepository.existsById(clubId)) {
            throw new ClubException.ClubNotFoundException();
        }
    }

    /** 작성자 이름은 한 번에 모아 해석한다 — 행마다 조회하면 목록 크기만큼 쿼리가 늘어난다(N+1). */
    private Map<Long, String> authorNamesOf(List<AdminFeeAuditComment> comments) {
        return userRepository.findAllById(
                        comments.stream().map(AdminFeeAuditComment::getAuthorUserId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, User::getName, (first, second) -> first));
    }

    /** 작성자가 탈퇴(soft delete)하면 이름만 비운다 — 의견 자체는 감사 산출물이라 남는다. */
    private static AdminFeeAuditCommentRow toRow(AdminFeeAuditComment comment, Map<Long, String> authorNames) {
        return new AdminFeeAuditCommentRow(
                comment.getId(),
                comment.getKind(),
                comment.getStatus(),
                comment.getContent(),
                authorNames.get(comment.getAuthorUserId()),
                comment.getCreatedAt(),
                comment.getUpdatedAt());
    }
}
