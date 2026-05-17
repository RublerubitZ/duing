package com.duing.domain.favorite.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FavoriteException extends ApplicationException {

    protected FavoriteException(String message, HttpStatus status) {
        super(message, status);
    }

    public static final class AlreadyFavoritedException extends FavoriteException {
        private static final String MESSAGE = "이미 찜한 동아리입니다.";

        public AlreadyFavoritedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}