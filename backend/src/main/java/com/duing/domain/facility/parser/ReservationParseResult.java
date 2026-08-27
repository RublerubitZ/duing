package com.duing.domain.facility.parser;

import java.util.List;

/**
 * 예약 JSON 배열 파싱 결과. 파싱 성공 행과 함께 건너뛴 원소 수·입력 원소 수를 실어 호출부가
 * 정상 / 전부 실패 / 부분 실패를 가를 수 있게 한다(P2-10).
 *
 * <p>부분 실패를 성공과 구분하지 못하면 파싱 실패한 원소가 기존 예약이어도 "학교에서 사라진 예약"으로
 * 오판돼 저장 행이 삭제되고 슬롯이 열린다(fail-open). 그래서 건너뛴 건수를 결과에 실어 호출부가
 * 그 달의 삭제를 보류할 수 있게 한다.
 */
public record ReservationParseResult(List<ParsedReservation> reservations, int skippedCount, int inputSize) {

    /** 일부 원소만 파싱 실패 — 성공 행은 반영하되 미반영 저장 행을 지우면 안 되는 상태. */
    public boolean partial() {
        return skippedCount > 0 && !reservations.isEmpty();
    }

    /** 원소가 있는데 전부 파싱 실패 — 학교 스키마 드리프트로 간주해 룸 실패 처리하는 상태. */
    public boolean allFailed() {
        return inputSize > 0 && reservations.isEmpty();
    }
}
