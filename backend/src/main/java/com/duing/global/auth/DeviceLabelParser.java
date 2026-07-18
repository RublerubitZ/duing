package com.duing.global.auth;

/** 웹 세션 목록 표시용 UA 경량 요약 — 외부 파서 의존성 없이 대표 브라우저·OS 만 식별한다. */
public final class DeviceLabelParser {

    private DeviceLabelParser() {
    }

    public static String summarize(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return null;
        }
        String browser = userAgent.contains("Edg/") ? "Edge"
                : userAgent.contains("SamsungBrowser/") ? "Samsung Internet"
                : userAgent.contains("Firefox/") ? "Firefox"
                : userAgent.contains("Chrome/") ? "Chrome"
                : userAgent.contains("Safari/") ? "Safari"
                : "브라우저";
        // iPhone/iPad UA 는 "like Mac OS X" 를 포함하므로 iOS 판정을 macOS 보다 먼저 둔다
        String operatingSystem = userAgent.contains("Windows") ? "Windows"
                : (userAgent.contains("iPhone") || userAgent.contains("iPad")) ? "iOS"
                : userAgent.contains("Mac OS X") ? "macOS"
                : userAgent.contains("Android") ? "Android"
                : null;
        return operatingSystem == null ? browser : browser + " · " + operatingSystem;
    }
}
