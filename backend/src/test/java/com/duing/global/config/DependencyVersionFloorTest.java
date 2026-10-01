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
 * 조용히 되살아난다. 이 테스트가 그 회귀를 잡는다. Boot 상향으로 BOM 관리 버전이 하한 이상이 되면
 * build.gradle.kts 의 오버라이드 줄과 함께 여기 행도 정리한다.
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

    /** "10.1.60.0" 같은 점 구분 숫자 버전을 세그먼트 배열로 바꾼다. 비교는 Arrays.compare 의 사전순이다. */
    private static int[] numericSegments(String version) {
        return Arrays.stream(version.split("\\.")).mapToInt(Integer::parseInt).toArray();
    }
}
