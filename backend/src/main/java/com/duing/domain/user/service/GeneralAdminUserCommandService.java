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
        // 메모 한 줄 바꾸는 데도 행을 잠근다 — 지우지 마라. User 에는 @Version 도 @DynamicUpdate 도 없어서
        // 더티 플러시가 모든 컬럼을 쓰는 UPDATE 를 낸다. 잠금 없이 읽으면 그 사이 다른 트랜잭션이 커밋한
        // status·token_version 까지 옛 스냅샷 값으로 되돌려 써, 계정 정지가 감사 로그만 남긴 채 사라진다.
        // 비관적 잠금은 쓰기 경로가 전부 잡아야 성립하므로 이 경로만 빠져도 changeStatus 의 보호가 뚫린다.
        User target = userRepository.findByIdForUpdate(updateAdminNoteCommand.targetUserId())
                .orElseThrow(UserException.UserNotFoundException::new);

        // 내용이 그대로면 무동작 — changeStatus 의 동일 상태 재요청과 같은 정책이다. 저장 버튼 연타가
        // 아무것도 고치지 않은 사람을 "최종 수정자" 로 만들고, 최신 20건만 보여주는 조치 이력에서
        // 정지·해제를 밀어내는 것을 막는다.
        // 메모 없음(null)과 빈 문자열은 컬럼 값으로는 다르지만 화면에서도 정책에서도 "메모 없음" 하나다 —
        // 메모가 없던 회원에게 빈 문자열을 저장하는 것은 실질 변화가 아니므로 같은 값으로 본다.
        String currentNote = target.getAdminNote() == null ? "" : target.getAdminNote();
        if (currentNote.equals(updateAdminNoteCommand.note())) {
            return;
        }
        target.changeAdminNote(updateAdminNoteCommand.note());

        // reason 은 null 로 둔다 — 메모 본문을 감사 로그에 복제하면 내부 메모가 두 테이블에 살면서
        // 보존·삭제 정책이 둘로 갈린다. 남기는 것은 "누가 언제 메모를 바꿨다"는 사실뿐이다.
        adminUserActionLogRepository.save(AdminUserActionLog.of(
                updateAdminNoteCommand.actorUserId(), target.getId(),
                AdminUserAction.ADMIN_NOTE_UPDATED, null));

        // 메모 본문은 절대 남기지 않는다 — 운영 로그는 접근 통제가 감사 테이블보다 느슨하다.
        log.info("Admin note updated. actorId={}, targetUserId={}",
                updateAdminNoteCommand.actorUserId(), target.getId());
    }

    @Override
    @Transactional  // 클래스 기본이 readOnly 라 반드시 명시한다 — 빠뜨리면 감사 로그 INSERT 가 실 Postgres 에서 터진다
    public String revealPhone(Long targetUserId, Long actorUserId) {
        // 이 클래스에서 유일하게 행을 잠그지 않고 User 를 읽는 자리다 — 누락이 아니다. 번호를 읽어 내보낼
        // 뿐 User 의 어떤 필드도 고치지 않아, 커밋 시 되돌려 쓸 더티 스냅샷 자체가 생기지 않는다.
        // 이 트랜잭션이 쓰는 것은 별도 테이블에 새로 넣는 감사 로그 한 줄뿐이라 User 행 잠금과 무관하다.
        User target = userRepository.findById(targetUserId)
                .orElseThrow(UserException.UserNotFoundException::new);

        adminUserActionLogRepository.save(AdminUserActionLog.of(
                actorUserId, target.getId(), AdminUserAction.PHONE_VIEW, null));

        // 개인정보 원본 열람은 그 자체가 감사 대상 행위다. 번호 값은 절대 로그에 남기지 않는다
        // (회장 경로 GeneralClubMemberQueryService 와 같은 형식·같은 action 키워드).
        log.info("member phone view: actorUserId={}, targetUserId={}, action=PHONE_VIEW",
                actorUserId, target.getId());
        return target.getPhone();
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
