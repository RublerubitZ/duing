package com.duing.domain.club.service.dto.command;

/**
 * 동아리 상세 진입 1건 기록 요청.
 *
 * @param clubId     조회된 동아리
 * @param visitorKey 클라이언트가 보관하는 익명 방문자 키 — 저장 전에 해시로 변환된다
 * @param clientIp   익명 경로의 총량 상한 축(레이트리밋). 저장하지 않는다.
 */
public record RecordClubViewCommand(Long clubId, String visitorKey, String clientIp) {
}
