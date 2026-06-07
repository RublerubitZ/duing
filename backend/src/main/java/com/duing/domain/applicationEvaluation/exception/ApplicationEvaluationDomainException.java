package com.duing.domain.applicationEvaluation.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ApplicationEvaluationDomainException extends ApplicationException {

    protected ApplicationEvaluationDomainException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class EvaluationScoreOutOfRangeException extends ApplicationEvaluationDomainException {
        public EvaluationScoreOutOfRangeException() {
            super("평가 점수는 1~5 사이여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
