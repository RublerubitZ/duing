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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class GeneralAdminUserCommandService implements AdminUserCommandService {

    private final UserRepository userRepository;
    private final AdminUserActionLogRepository adminUserActionLogRepository;
    private final AuthSessionService authSessionService;

    @Override
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

        if (changeStatusCommand.status() == UserStatus.SUSPENDED) {
            target.suspend();
            // 정지는 즉시 집행이다 — 발급된 토큰을 무효화하고 모든 세션을 폐기한다.
            target.bumpTokenVersion();
            authSessionService.revokeAll(target.getId(), SessionRevokeReason.ADMIN_FORCE);
        } else {
            // 해제는 상태만 되돌린다 — token_version 은 되돌릴 수 없고, 재로그인하면 그만이다.
            target.unsuspend();
        }

        AdminUserAction action = changeStatusCommand.status() == UserStatus.SUSPENDED
                ? AdminUserAction.ACCOUNT_SUSPENDED
                : AdminUserAction.ACCOUNT_UNSUSPENDED;
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                changeStatusCommand.actorUserId(), target.getId(), action, changeStatusCommand.reason()));

        log.info("Admin account status change. actorId={}, targetUserId={}, action={}",
                changeStatusCommand.actorUserId(), target.getId(), action);
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
