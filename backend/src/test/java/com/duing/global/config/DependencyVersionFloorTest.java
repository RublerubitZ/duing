package com.duing.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.cfg.PackageVersion;
import java.util.Arrays;
import java.util.stream.Stream;
import org.apache.catalina.util.ServerInfo;
import org.apache.commons.lang3.StringUtils;
import org.apache.logging.log4j.LogManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 보안 오버라이드 하한 가드 — build.gradle.kts 의 {@code extra["…version"]} 오버라이드가 실제로 로드된 jar 에
 * 반영됐는지 각 라이브러리가 스스로 밝히는 버전으로 확인한다.
 *
 * <p>오버라이드 줄이 지워지거나, Boot 를 올리면서 BOM 관리 버전이 하한 아래로 내려가면 막아 둔 알려진 취약점이
 * 조용히 되살아난다. 이 테스트가 그 회귀를 잡는다.
 *
 * <p>하한은 숫자만 비교하므로 같은 릴리스 라인(10.1.x·2.21.x 처럼) 안에서만 의미가 있다. 수정판의 패치 번호는
 * 라인마다 달라서, 라인이 바뀌면(예: Boot 4 의 Tomcat 11) 숫자로는 하한보다 높지만 수정이 빠진 버전도 통과한다.
 * <ul>
 *   <li>같은 라인에서 BOM 관리 버전이 하한 이상이 되면 build.gradle.kts 의 오버라이드 줄과 여기 행을 함께 지운다.</li>
 *   <li>라인이 바뀌면 새 버전에 수정이 들어 있는지 OSV 에서 먼저 확인한다. 들어 있으면 둘 다 지우고, 빠져 있으면
 *       새 라인의 수정판으로 오버라이드와 이 행의 하한을 함께 올린다.</li>
 * </ul>
 *
 * <p>jar 의 버전 정보만 읽으므로 Spring 컨텍스트·Testcontainers 없이 순수 JUnit 으로 돈다.
 */
class DependencyVersionFloorTest {

    static Stream<Arguments> loadedVersions() throws ReflectiveOperationException {
        // pgjdbc 는 runtimeOnly 라 테스트 컴파일 클래스패스에 없다. 리플렉션으로 읽으면 상수 인라인도 피한다.
        String pgjdbcVersion = (String) Class.forName("org.postgresql.util.DriverInfo")
                .getField("DRIVER_VERSION")
                .get(null);
        return Stream.of(
                Arguments.of("commons-lang3", "3.18.0", "StringUtils 패키지 Implementation-Version",
                        StringUtils.class.getPackage().getImplementationVersion()),
                Arguments.of("log4j-api", "2.25.5", "LogManager 패키지 Implementation-Version",
                        LogManager.class.getPackage().getImplementationVersion()),
                Arguments.of("Tomcat", "10.1.60", "ServerInfo.getServerNumber()",
                        ServerInfo.getServerNumber()),
                Arguments.of("Jackson", "2.21.7", "jackson-databind PackageVersion.VERSION",
                        PackageVersion.VERSION.toString()),
                Arguments.of("pgjdbc", "42.7.13", "DriverInfo.DRIVER_VERSION", pgjdbcVersion));
    }

    @ParameterizedTest(name = "{0} {1} 이상이 로드된다")
    @MethodSource("loadedVersions")
    @DisplayName("보안 오버라이드한 라이브러리는 취약점 수정 하한 이상의 버전이 로드된다")
    void loadedVersionIsAtLeastFloor(String library, String floor, String source, String loadedVersion) {
        assertThat(loadedVersion).as("%s 버전을 읽지 못했다 — 출처: %s", library, source).isNotNull();
        assertThat(Arrays.compare(numericSegments(loadedVersion), numericSegments(floor)))
                .as("%s: 로드 버전 %s < 하한 %s — build.gradle.kts 오버라이드를 확인하라(출처: %s)",
                        library, loadedVersion, floor, source)
                .isGreaterThanOrEqualTo(0);
    }

    /**
     * "10.1.60.0"·"2.21.7-1" 같은 버전에서 숫자 묶음만 뽑는다. "-SNAPSHOT" 같은 한정어 문자는 버린다.
     * 비교는 Arrays.compare 의 사전순이다.
     */
    private static int[] numericSegments(String version) {
        return Arrays.stream(version.split("\\D+"))
                .filter(segment -> !segment.isEmpty())
                .mapToInt(Integer::parseInt)
                .toArray();
    }
}
