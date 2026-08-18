package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 무클럭 {@code LocalDateTime.now()} 계열의 신규 도입을 막는 가드 —
 * AGENTS.md 시간 처리 규칙("판정은 항상 {@code now(seoulClock)}, 무클럭 {@code now()} 신규 작성 금지")의 기계화다.
 *
 * <p>무클럭 now() 는 JVM 기본 존(prod=UTC, 로컬=KST)의 벽시계를 읽는다. 판정 경로에 쓰면 같은 코드가
 * 환경마다 다른 날짜를 보고(마감·오늘이 9시간 어긋남), 저장 경로에 쓰면 그 컬럼이 seoul regime 값과
 * 섞여 응답 변환 존을 특정할 수 없게 된다(TIMEZONE.md 의 regime 대응표가 필드마다 writer 를 추적하는 이유).
 *
 * <p>{@code Instant.now()}·{@code new Date()} 는 존 무관 절대시각이라 스캔 대상이 아니다.
 *
 * <p>허용목록이 <b>파일→개수</b> 인 것은 의도적이다. 파일 단위 허용이면 이미 등재된 파일 안에서 무클럭 now()
 * 를 하나 더 늘려도 가드가 침묵한다. 소스 트리를 읽고 문자열을 보는 게 전부라 Spring 컨텍스트·Testcontainers
 * 없이 순수 JUnit 으로 돈다(전례: {@link MigrationExpandContractGuardTest},
 * {@code com.duing.global.config.ProdJobTogglePolicyTest}).
 */
class ClocklessNowGuardTest {

    private static final Path MAIN_SOURCE_ROOT = Path.of("src/main/java");

    /** 인자 없는 날짜/시각 now(). Instant·Date 는 절대시각이라 제외한다. */
    private static final Pattern CLOCKLESS_NOW = Pattern.compile(
            "\\b(LocalDateTime|LocalDate|LocalTime|ZonedDateTime|OffsetDateTime|YearMonth|Year)\\.now\\(\\s*\\)");

    /**
     * 무클럭 now() 가 남아 있어도 되는 파일과 그 개수. 개수까지 고정해 "이미 등재된 파일에 한 줄 더" 를 막는다.
     *
     * <p>등재 사유는 셋 중 하나다 — ① 엔티티 스탬프(같은 컬럼에 두 regime 이 섞이지 않도록 개별 전환 금지),
     * ② 판정이 아닌 의도적 system-regime 계산, ③ 절대시각 대신 상대 경과만 보는 코드.
     */
    private static final Map<String, Integer> CLOCKLESS_NOW_ALLOWLIST = new TreeMap<>(Map.ofEntries(
            // ── ① 엔티티 스탬프 (Do-Not-Refactor) ─────────────────────────────────────────
            // 이 10 파일은 전부 저장 스탬프다. 같은 컬럼의 기존 행이 전부 system regime 이라
            // 일부만 seoulClock 으로 바꾸면 한 컬럼에 두 벽시계가 섞여 2단계 백필이 불가능해진다
            // (club_event start_at 오염 전례 — TIMEZONE.md 알려진 이슈 1). 전환은 BaseEntity Instant
            // 전환·timestamptz 통일과 같은 릴리스에서 컬럼 단위로 한 번에 한다.
            Map.entry("domain/draft/entity/ApplicationDraft.java", 2),
            Map.entry("domain/club/entity/Club.java", 1),
            Map.entry("domain/clubmember/entity/LeaderSuccessionRequest.java", 1),
            Map.entry("domain/favorite/entity/ClubFavorite.java", 1),
            Map.entry("domain/notification/entity/Notification.java", 2),
            Map.entry("domain/notice/broadcast/entity/NoticeBroadcast.java", 1),
            Map.entry("domain/notice/broadcast/entity/NoticeBroadcastRead.java", 1),
            Map.entry("domain/federation/entity/FederationInquiry.java", 2),
            Map.entry("domain/promotion/entity/PromotionRequest.java", 1),
            Map.entry("domain/report/entity/Report.java", 1),

            // ── ② 의도적 system-regime 계산 ────────────────────────────────────────────────
            // soft-delete·읽음처리 벌크 UPDATE. 대상 컬럼(deleted_at·read_at)이 감사 필드와 같은
            // system regime 이라 저장 존 벽시계로 찍는 게 정합이다.
            Map.entry("domain/recruitment/service/GeneralRecruitmentService.java", 1),
            Map.entry("domain/notification/repository/NotificationRepositoryImpl.java", 1),
            // created_at(system regime)과 같은 공간에서 비교하는 지표 계산. 판정이 아니라 집계 경계다.
            Map.entry("domain/club/metric/service/GeneralClubMetricService.java", 1),
            // users.last_login_at 저장 겸용이라 동결. 여기만 seoulClock 으로 바꾸면 같은 컬럼의
            // 기존 행(system)과 신규 행(seoul)이 갈려 응답 변환 존을 특정할 수 없다 —
            // 2단계 백필과 같은 릴리스에서만 전환한다.
            Map.entry("domain/user/service/GeneralUserService.java", 1),

            // ── ③ 상대 경과만 보는 코드 ───────────────────────────────────────────────────
            // 두 시각의 차이만 쓰고 절대시각을 저장·판정하지 않아 존과 무관하다.
            Map.entry("global/mo/StubMoVerificationClient.java", 2),
            Map.entry("global/file/controller/FileController.java", 1)));

    @Test
    @DisplayName("허용목록에 없는 무클럭 LocalDateTime.now() 가 새로 도입되면 실패한다")
    void newClocklessNowIsRejected() throws IOException {
        Map<String, Integer> actual = scanClocklessNow();

        List<String> violations = new ArrayList<>();
        actual.forEach((sourceFile, count) -> {
            int allowed = CLOCKLESS_NOW_ALLOWLIST.getOrDefault(sourceFile, 0);
            if (count > allowed) {
                violations.add("%s — 허용 %d, 실제 %d".formatted(sourceFile, allowed, count));
            }
        });

        assertThat(violations)
                .as("무클럭 now() 는 JVM 기본 존(prod=UTC, 로컬=KST) 벽시계라 환경마다 다른 날짜를 본다. "
                        + "마감·오늘 같은 판정에는 주입한 seoulClock 으로 now(clock) 을 쓰고, "
                        + "system regime 컬럼과 비교할 경계가 필요하면 TimeMapper.systemNow(clock) "
                        + "또는 TimeMapper.seoulToSystemWallClock(...) 을 쓰라(TIMEZONE.md 참조). "
                        + "의도적인 예외라면 CLOCKLESS_NOW_ALLOWLIST 에 근거 주석과 함께 개수를 올려 등재하라.")
                .isEmpty();
    }

    @Test
    @DisplayName("허용목록 항목이 실제보다 많으면 실패한다 — 정리된 만큼 목록도 줄여야 가드가 조여진다")
    void staleAllowlistEntriesAreRejected() throws IOException {
        Map<String, Integer> actual = scanClocklessNow();

        List<String> staleEntries = CLOCKLESS_NOW_ALLOWLIST.entrySet().stream()
                .filter(allowed -> actual.getOrDefault(allowed.getKey(), 0) < allowed.getValue())
                .map(allowed -> "%s — 허용 %d, 실제 %d".formatted(
                        allowed.getKey(), allowed.getValue(), actual.getOrDefault(allowed.getKey(), 0)))
                .toList();

        assertThat(staleEntries)
                .as("무클럭 now() 가 정리됐거나 파일이 옮겨졌는데 허용목록이 옛 개수를 유지하고 있다. "
                        + "그만큼 새 무클럭 now() 가 조용히 들어올 여지가 남으므로 "
                        + "CLOCKLESS_NOW_ALLOWLIST 의 개수를 실제에 맞춰 줄이거나 항목을 삭제하라.")
                .isEmpty();
    }

    /** src/main/java 전체를 훑어 파일별(패키지 상대경로) 무클럭 now() 개수를 센다. */
    private Map<String, Integer> scanClocklessNow() throws IOException {
        Map<String, Integer> counts = new LinkedHashMap<>();
        try (Stream<Path> sources = Files.walk(MAIN_SOURCE_ROOT)) {
            for (Path source : sources.filter(path -> path.toString().endsWith(".java")).toList()) {
                int count = countClocklessNow(source);
                if (count > 0) {
                    counts.put(MAIN_SOURCE_ROOT.resolve("com/duing").relativize(source).toString(), count);
                }
            }
        }
        // 소스 트리를 못 읽으면 스캔이 빈 결과가 되어 가드가 조용히 무력화되므로 여기서 끊는다.
        assertThat(counts).as("src/main/java 스캔 결과가 비었다 — 경로/패턴 확인").isNotEmpty();
        return counts;
    }

    private int countClocklessNow(Path source) throws IOException {
        int count = 0;
        // 주석은 제외한다. regime 을 설명하는 주석·javadoc 이 now() 를 언급하는 것만으로 걸리면 안 된다.
        for (String line : Files.readAllLines(source, StandardCharsets.UTF_8)) {
            String code = line.strip();
            if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) {
                continue;
            }
            Matcher clocklessNow = CLOCKLESS_NOW.matcher(code);
            while (clocklessNow.find()) {
                count++;
            }
        }
        return count;
    }
}
