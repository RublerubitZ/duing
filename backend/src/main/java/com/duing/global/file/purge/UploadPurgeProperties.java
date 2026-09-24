package com.duing.global.file.purge;

import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 업로드 고아 객체 정리 잡 설정(#791, 스펙 §5). {@code FederationInquiryPurgeProperties} 와 같은 구조.
 *
 * <p>{@code enabled} 는 스케줄링 on/off(prod 기본 활성). {@code deleteEnabled} 는 실삭제 on/off — 1차 릴리스는
 * false(dry-run: 후보를 로그로만 기록)로 두고, 일주일간 {@code referenced=true} 후보가 0건임을 확인한 뒤
 * true 로 전환한다. {@code window} 는 업로드 후 PENDING 으로 남을 수 있는 유예(기본 24시간).
 * {@code grace} 는 claim(PURGING) 뒤 실삭제까지의 유예(#1258, 기본 24시간) — R2 는 버전 관리가 없어 오판 삭제를
 * 되돌릴 수 없으므로, 그 사이 참조가 생기면 다음 실행의 참조 스캔이 ACTIVE 로 되돌린다.
 */
@Validated
@ConfigurationProperties(prefix = "duing.upload.purge")
public record UploadPurgeProperties(boolean enabled, boolean deleteEnabled, @NotNull Duration window,
        @NotNull Duration grace) {
}
