package com.duing.domain.joincode.service.dto.command;

/**
 * 학생의 가입 요청 생성 명령.
 *
 * <p>{@code rawCode} 는 사용자 입력 그대로(대소문자·공백 미정규화) 담고, 정규화는 서비스가 수행한다.
 * {@code clientIp} 는 IP 레이트리밋 키다.
 */
public record CreateJoinRequestCommand(
        String rawCode,
        Long userId,
        String clientIp
) {
}
