package com.duing.domain.user.service;

import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.SessionRevokeReason;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.UpdateAdminNoteCommand;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
// 쓰기 전용 서비스지만 클래스 기본은 레포 관례대로 readOnly 다 — 여기에는 조회 형태로 보이면서
// 감사 로그를 남기는(=쓰기) 메서드가 앞으로 붙는다. 트랜잭션 성격을 메서드마다 적어야 그 자리에서 드러난다.
@Transactional(readOnly = true)
@Slf4j
public class GeneralAdminUserCommandService implements AdminUserCommandService {

    private final UserRepository userRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;
    private final AuthSessionService authSessionService;

    @Override
    @Transactional
    public void changeStatus(ChangeUserStatusCommand changeStatusCommand) {
        // 강제 로그아웃과 같은 순서 — token_version lost update 를 막기 위해 행을 잠그고 조회한다.
        User target = userRepository.findByIdForUpdate(changeStatusCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);

        if (changeStatusCommand.status() == UserStatus.SUSPENDED) {
            assertSuspendable(target, changeStatusCommand.actorUserId());
        }

        // 같은 상태로의 재요청은 무동작 — 버튼 연타가 감사 이력을 오염시키지 않게 한다.
        if (target.getStatus() == changeStatusCommand.status()) {
            return;
        }

        // default 없는 switch 식 — UserStatus 에 상태가 추가되면 컴파일이 깨져 여기를 반드시 다시 보게 한다.
        // (if/else 였다면 새 상태가 조용히 "해제" 로 처리됐다.)
        AdminUserAction action = switch (changeStatusCommand.status()) {
            case SUSPENDED -> {
                target.suspend();
                // 정지는 즉시 집행이다 — 발급된 토큰을 무효화하고 모든 세션을 폐기한다.
                target.bumpTokenVersion();
                authSessionService.revokeAll(target.getId(), SessionRevokeReason.ADMIN_FORCE);
                yield AdminUserAction.ACCOUNT_SUSPENDED;
            }
            case ACTIVE -> {
                // 해제는 상태만 되돌린다 — token_version 은 되돌릴 수 없고, 재로그인하면 그만이다.
                target.unsuspend();
                yield AdminUserAction.ACCOUNT_UNSUSPENDED;
            }
        };

        adminUserActionLogRepository.save(AdminUserActionLog.of(
                changeStatusCommand.actorUserId(), target.getId(), action, changeStatusCommand.reason()));

        log.info("Admin account status change. actorId={}, targetUserId={}, action={}",
                changeStatusCommand.actorUserId(), target.getId(), action);
    }

    @Override
    @Transactional
    public void updateAdminNote(UpdateAdminNoteCommand updateAdminNoteCommand) {
        User target = userRepository.findById(updateAdminNoteCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);
        target.changeAdminNote(updateAdminNoteCommand.note());

        // reason 은 null 로 둔다 — 메모 본문을 감사 로그에 복제하면 내부 메모가 두 테이블에 살면서
        // 보존·삭제 정책이 둘로 갈린다. 남기는 것은 "누가 언제 메모를 바꿨다"는 사실뿐이다.
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                updateAdminNoteCommand.actorUserId(), target.getId(),
                AdminUserAction.ADMIN_NOTE_UPDATED, null));
    }

    private void assertSuspendable(User target, Long actorUserId) {
        if (target.getId().equals(actorUserId)) {
            throw new UserException.SelfSuspendNotAllowedException();
        }
        if (target.getRole() == UserRole.ADMIN) {
            throw new UserException.AdminSuspendNotAllowedException();
        }
    }
}
