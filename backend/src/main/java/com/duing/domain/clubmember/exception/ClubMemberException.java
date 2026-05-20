package com.duing.domain.clubmember.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubMemberException extends ApplicationException {

    protected ClubMemberException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NotClubMemberException extends ClubMemberException {
        private static final String MESSAGE = "해당 동아리의 회원이 아닙니다.";

        public NotClubMemberException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class NotClubManagerException extends ClubMemberException {
        private static final String MESSAGE = "해당 동아리의 회장 또는 운영진만 수행할 수 있습니다.";

        public NotClubManagerException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class DuplicateMembershipException extends ClubMemberException {
        private static final String MESSAGE = "이미 동아리 회원입니다.";

        public DuplicateMembershipException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static final class NotAMember extends ClubMemberException {
        public NotAMember() {
            super("해당 동아리의 멤버가 아닙니다.", HttpStatus.FORBIDDEN);
        }
    }

    public static final class NotFound extends ClubMemberException {
        public NotFound() {
            super("동아리 멤버를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class CannotChangeOwnRole extends ClubMemberException {
        public CannotChangeOwnRole() {
            super("본인의 역할은 변경할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class CannotRemoveSelf extends ClubMemberException {
        public CannotRemoveSelf() {
            super("본인을 강퇴할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class CannotModifyLeader extends ClubMemberException {
        public CannotModifyLeader() {
            super("회장의 역할은 변경하거나 강퇴할 수 없습니다. 회장 인계를 이용하세요.",
                    HttpStatus.CONFLICT);
        }
    }

    public static final class LeaderCannotLeave extends ClubMemberException {
        public LeaderCannotLeave() {
            super("회장은 회장 인계 후에 탈퇴할 수 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class TransferTargetInvalid extends ClubMemberException {
        public TransferTargetInvalid() {
            super("회장 인계 대상은 같은 동아리의 OFFICER 또는 MEMBER 여야 합니다.",
                    HttpStatus.BAD_REQUEST);
        }
    }

    public static final class InvalidRoleAssignment extends ClubMemberException {
        public InvalidRoleAssignment() {
            super("역할 변경은 OFFICER 또는 MEMBER 로만 가능합니다. 회장은 회장 인계를 이용하세요.",
                    HttpStatus.BAD_REQUEST);
        }
    }

    public static final class ConcurrentTransferDetected extends ClubMemberException {
        public ConcurrentTransferDetected() {
            super("동시 회장 인계가 감지되었습니다. 이미 회장이 변경된 상태입니다.",
                    HttpStatus.CONFLICT);
        }
    }

    public static class InvalidSuccessionTransition extends ClubMemberException {
        public InvalidSuccessionTransition(String reason) {
            super("승계 요청 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
}


