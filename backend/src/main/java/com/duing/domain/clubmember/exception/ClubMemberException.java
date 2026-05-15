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
}
