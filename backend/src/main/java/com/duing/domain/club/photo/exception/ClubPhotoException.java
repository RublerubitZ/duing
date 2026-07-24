package com.duing.domain.club.photo.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubPhotoException extends ApplicationException {

    protected ClubPhotoException(String message, HttpStatus status) {
        super(message, status);
    }

    public static final class NotFound extends ClubPhotoException {
        public NotFound() {
            super("활동사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class NotInClub extends ClubPhotoException {
        public NotInClub() {
            super("해당 동아리에 속한 활동사진이 아닙니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class OrderMismatch extends ClubPhotoException {
        public OrderMismatch() {
            super("정렬 페이로드의 사진 집합이 현재 동아리 활동사진과 일치하지 않습니다.",
                    HttpStatus.BAD_REQUEST);
        }
    }

    public static final class ReferencedByHeroActivity extends ClubPhotoException {
        public ReferencedByHeroActivity() {
            super("대표 활동에 사용 중인 사진입니다. 대표 활동에서 먼저 해제해주세요.",
                    HttpStatus.CONFLICT);
        }
    }
}
