package com.duing.domain.club.heroactivity.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubHeroActivityException extends ApplicationException {

    protected ClubHeroActivityException(String message, HttpStatus status) {
        super(message, status);
    }

    public static final class NotFound extends ClubHeroActivityException {
        public NotFound() {
            super("대표 활동을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class NotInClub extends ClubHeroActivityException {
        public NotInClub() {
            super("해당 동아리의 대표 활동이 아닙니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class PhotoNotFound extends ClubHeroActivityException {
        public PhotoNotFound() {
            super("참조할 활동사진을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static final class SlotOutOfRange extends ClubHeroActivityException {
        public SlotOutOfRange() {
            super("대표 활동 순서는 1~6 사이여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static final class SlotOccupied extends ClubHeroActivityException {
        public SlotOccupied() {
            super("이미 사용 중인 대표 활동 슬롯입니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class PhotoAlreadyFeatured extends ClubHeroActivityException {
        public PhotoAlreadyFeatured() {
            super("이미 대표 활동으로 등록된 사진입니다.", HttpStatus.CONFLICT);
        }
    }

    public static final class OrderMismatch extends ClubHeroActivityException {
        public OrderMismatch() {
            super("정렬 페이로드가 현재 대표 활동 집합과 일치하지 않습니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
