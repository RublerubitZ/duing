package com.duing.domain.user.profilecheck.repository;

import com.duing.domain.user.profilecheck.entity.ProfileCheckSetting;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProfileCheckSettingRepository extends JpaRepository<ProfileCheckSetting, Long> {

    /**
     * 설정 행 선삽입 — 이미 있으면 무시한다. 행이 없을 때 FOR UPDATE 는 아무것도 잠그지 않으므로, 운영진 두 명의
     * 첫 저장이 겹쳐도 뒤따르는 행잠금 조회가 반드시 행을 찾게 먼저 넣어 둔다(FacilitySubmissionSequenceRepository 전례).
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            INSERT INTO profile_check_setting
                (id, enabled, semester_year, semester_term, title, message,
                 created_by, updated_by, created_at, updated_at)
            VALUES (:id, FALSE, NULL, NULL, :title, :message, :actorId, :actorId, now(), now())
            ON CONFLICT (id) DO NOTHING
            """, nativeQuery = true)
    void insertIfAbsent(@Param("id") long id,
                        @Param("title") String title,
                        @Param("message") String message,
                        @Param("actorId") Long actorId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT setting FROM ProfileCheckSetting setting WHERE setting.id = :id")
    Optional<ProfileCheckSetting> findByIdForUpdate(@Param("id") long id);
}
