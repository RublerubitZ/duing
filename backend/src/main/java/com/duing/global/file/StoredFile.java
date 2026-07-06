package com.duing.global.file;

import java.io.InputStream;

/**
 * {@link FileStorageService#download(String)} 조회 결과 — 인증 프록시 다운로드 응답에 그대로 실린다.
 *
 * <p>{@code stream} 은 호출측(HTTP 응답)에서 소비 후 닫아야 한다 — 조회 시점에 미리 닫으면
 * 스트리밍 응답이 빈 본문이 되므로, 조회 메서드는 절대 이 스트림을 close 하지 않는다.
 */
public record StoredFile(InputStream stream, String contentType, long contentLength) {
}
