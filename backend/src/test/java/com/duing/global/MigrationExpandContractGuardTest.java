package com.duing.global;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * 같은 릴리스에서 Expand(컬럼·테이블 추가)와 Contract(제약 강화·컬럼 삭제)를 함께 수행하는
 * 마이그레이션을 막는 가드.
 *
 * <p>배포 실패 시 자동 롤백(deploy-backend.yml)으로 구 이미지가 다시 뜨는데 Flyway 는 되돌아가지
 * 않는다. 그래서 구 이미지는 최신 스키마 위에서 "새 릴리스가 손댄 컬럼을 모르는 상태"로 동작한다.
 * Hibernate 는 매핑에 없는 컬럼을 INSERT 문에서 아예 빼므로 {@code DROP DEFAULT}/{@code SET NOT NULL}
 * 은 not-null 위반을, 반대로 매핑에 남아 있는 컬럼을 지우는 {@code DROP COLUMN} 은
 * {@code column ... does not exist} 를 만든다. 둘 다 앱은 healthy 인 채 해당 기능의 INSERT 만
 * 조용히 500 이 되는 같은 장애다.
 *
 * <p>판정 기준은 "제약 강화가 존재함"이 아니라 <b>"Expand 와 Contract 가 같은 파일(=같은 릴리스)에
 * 함께 있음"</b> 이다. 구 이미지 재배포 가능성이 사라진 다음 릴리스에서 단독으로 수행하는 Contract 는
 * 안전하므로 통과해야 한다 — 그렇지 않으면 AGENTS.md 가 지시하는 올바른 작업이 매번 가드에 걸려
 * 허용목록만 부풀고 가드가 서서히 무력화된다.
 *
 * <p>디렉터리를 읽고 문자열을 보는 게 전부라 Spring 컨텍스트·Testcontainers 없이 순수 JUnit 으로 돈다.
 * 롤백 안전성 재현 테스트는 {@link MigrationRollbackSafetyTest} 에 있다.
 */
class MigrationExpandContractGuardTest {

    /**
     * Expand 와 Contract 가 같은 파일에 있지만 이미 배포되어 되돌릴 수 없는 마이그레이션.
     * 이 목록 밖의 파일이 걸리면 가드가 실패한다.
     */
    private static final Set<String> EXPAND_CONTRACT_ALLOWLIST = Set.of(
            // club_member 신설과 club.leader_id 삭제가 한 파일에 있다. 초기 스키마 재편이라
            // 되돌릴 수 없고 롤백 대상 릴리스가 아주 오래됐다.
            "V7__create_club_member_and_rebase_leader.sql",
            // 사용자 프로필 필수화. grade·college·major·phone·terms_agreed_at 은 빈 문자열 기본값이
            // 의미상 틀리고(phone 은 CHECK 제약·부분 UNIQUE 인덱스까지 걸려 있다) 롤백 대상 릴리스가
            // 아주 오래됐으므로 DEFAULT 를 두지 않는다.
            "V19__add_user_profile_columns.sql",
            // application.version 추가 + DROP DEFAULT — V90 이 DEFAULT 0 을 되살려 중화했다.
            "V37__alter_application_add_version.sql",
            // leader_succession_request.version 추가 + DROP DEFAULT — V90 이 DEFAULT 0 을 되살려 중화했다.
            "V39__alter_leader_succession_request_add_version.sql",
            // facility_booking.contact_phone 추가 + DROP DEFAULT — V90 이 DEFAULT '' 를 되살려 중화했다.
            "V85__facility_booking_contact_phone.sql"
    );

    private static final String MIGRATION_DIRECTORY = "db/migration";

    private static final Pattern EXPAND_STATEMENT = Pattern.compile("ADD COLUMN|CREATE TABLE");
    private static final Pattern CONTRACT_STATEMENT = Pattern.compile("DROP DEFAULT|SET NOT NULL|DROP COLUMN");

    @Test
    @DisplayName("한 마이그레이션이 컬럼 추가와 제약 강화·컬럼 삭제를 함께 수행하면 실패한다 — 자동 롤백 시 구 이미지의 INSERT 가 깨진다")
    void newMigrationsMustNotMixExpandAndContract() throws IOException {
        List<String> unexpectedFiles = listMigrationFiles().stream()
                .filter(this::mixesExpandAndContract)
                .map(File::getName)
                .filter(fileName -> !EXPAND_CONTRACT_ALLOWLIST.contains(fileName))
                .sorted()
                .toList();

        assertThat(unexpectedFiles)
                .as("이 마이그레이션들이 컬럼 추가(Expand)와 제약 강화·컬럼 삭제(Contract)를 한 릴리스에서 함께 수행한다. "
                        + "배포 실패 시 자동 롤백으로 구 이미지가 다시 뜨는데 Flyway 는 되돌아가지 않으므로, "
                        + "구 이미지가 모르는 NOT NULL 컬럼에 DEFAULT 가 없거나 구 이미지가 아직 매핑 중인 컬럼이 사라지면 "
                        + "해당 기능의 INSERT 만 조용히 500 이 된다. "
                        + "같은 릴리스에서는 Expand 까지만 하고, Contract 는 구 이미지 재배포 가능성이 사라진 "
                        + "다음 릴리스에서 단독 마이그레이션으로 수행하라(단독 Contract 는 이 가드를 통과한다). "
                        + "의도적인 예외라면 EXPAND_CONTRACT_ALLOWLIST 에 근거와 함께 추가하라.")
                .isEmpty();
    }

    private List<File> listMigrationFiles() throws IOException {
        File[] migrationFiles = new ClassPathResource(MIGRATION_DIRECTORY).getFile()
                .listFiles((directory, fileName) -> fileName.endsWith(".sql"));
        // 디렉터리를 못 읽으면 스캔 결과가 빈 목록이 되어 가드가 조용히 무력화되므로 여기서 끊는다.
        assertThat(migrationFiles).as("마이그레이션 디렉터리를 읽지 못했다").isNotNull().isNotEmpty();
        return Arrays.asList(migrationFiles);
    }

    private boolean mixesExpandAndContract(File migrationFile) {
        try {
            // 주석(-- ...)은 제거하고 실행문만 본다. 롤백 안전 규칙을 설명하는 주석이
            // "DROP DEFAULT" 를 언급하는 것만으로 가드에 걸리면 안 된다(V90 이 그런 경우다).
            String executableSql = Files.readString(migrationFile.toPath(), StandardCharsets.UTF_8)
                    .replaceAll("--[^\n]*", "")
                    .toUpperCase();
            return EXPAND_STATEMENT.matcher(executableSql).find()
                    && CONTRACT_STATEMENT.matcher(executableSql).find();
        } catch (IOException readFailure) {
            throw new IllegalStateException("마이그레이션 파일을 읽지 못했다: " + migrationFile.getName(), readFailure);
        }
    }
}
