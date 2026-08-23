package com.duing.domain.federation.service.dto.command;

// clientIp 는 익명 제출의 IP 레이트리밋 축이다 — sessionKey 가 클라이언트 생성이라 dedup 만으로는
// 행 증식을 막지 못한다. 로그인 제출(userId != null)에서는 쓰이지 않는다.
public record SubmitFederationFaqFeedbackCommand(
        Long faqId, boolean helpful, String sessionKey, Long userId, String clientIp) {
}
