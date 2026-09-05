package com.duing.global.file.repository;

import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 업로드 객체 추적 리포지토리. 상태를 바꾸는 경로는 전부 잠금 조회({@code …ForUpdate}) + 엔티티 전이 메서드다 —
 * 벌크 JPQL UPDATE 를 두지 않는다(호출 도메인 tx 의 영속성 컨텍스트를 clear 하거나 stale 하게 만든다, 스펙 §3.2).
 * 잠금 조회는 그 tx 안에서 이 엔티티의 유일한 첫 조회여야 한다(무잠금 선조회가 1차 캐시를 오염시키면
 * 잠금이 낡은 스냅샷을 돌려준다).
 */
public interface UploadedObjectRepository extends JpaRepository<UploadedObject, Long> {

    /** 무잠금 조회 — 테스트·검증 전용. 상태 전이 경로에서는 쓰지 않는다. */
    Optional<UploadedObject> findByStorageKey(String storageKey);

    /** attach 활성화용 잠금 조회 — 도메인 tx 커밋까지 행을 잠가 파기 잡의 claim 을 대기시킨다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject WHERE uploadedObject.storageKey = :storageKey")
    Optional<UploadedObject> findByStorageKeyForUpdate(@Param("storageKey") String storageKey);

    /** 파기 잡 claim·확정용 잠금 조회 — 짧은 tx 안에서 상태 술어를 재평가한다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject WHERE uploadedObject.id = :id")
    Optional<UploadedObject> findByIdForUpdate(@Param("id") Long id);

    /**
     * 파기 후보 — 주어진 상태(PENDING·PURGING)이면서 cutoff 이전에 업로드된 행을 id 오름차순으로.
     * ORDER BY id 로 처리 순서를 결정화해 "개별 실패 후 다음 후보 계속 처리" 계약을 테스트 가능하게 한다.
     */
    @Query("SELECT uploadedObject FROM UploadedObject uploadedObject "
            + "WHERE uploadedObject.status IN :statuses AND uploadedObject.uploadedAt < :cutoff "
            + "ORDER BY uploadedObject.id ASC")
    List<UploadedObject> findPurgeCandidates(@Param("statuses") Collection<UploadedObjectStatus> statuses,
                                             @Param("cutoff") Instant cutoff,
                                             Pageable pageable);

    /**
     * 참조 스캔 안전망(스펙 §4.3) — 스토리지 키가 어떤 엔티티에서든 아직 쓰이고 있으면 true.
     * 활성화 지점 누락을 데이터 손실 대신 WARN 으로 바꾸는 장치이므로 {@code FilePurpose} 에 purpose 가
     * 추가되면 이 문장에도 저장 위치를 추가해야 한다.
     *
     * <p>URL 컬럼은 접미 일치({@code LIKE '%/' || key}) — publicBaseUrl 이 무엇이든 맞춘다. 키는
     * {@code {dir}/{UUID}.{ext}} 형식이라 {@code %}·{@code _} 가 없어 LIKE 이스케이프가 필요 없다.
     * club_photo.storage_key 는 실제로 URL 이 저장되지만(프론트가 응답 url 을 그대로 보냄) 키만 저장된
     * 과거 행도 있을 수 있어 둘 다 본다. soft-delete 된 행도 참조로 센다(보수적).
     * ponytail: 후보(≤500/시)에 대해서만 실행되는 접미 LIKE seq scan — 후보가 상한을 상시 채우면 전용 참조 테이블로.
     */
    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM club WHERE logo_url LIKE '%/' || :key OR cover_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM club_photo WHERE storage_key = :key OR storage_key LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM notice WHERE cover_image_url LIKE '%/' || :key OR content LIKE '%/' || :key || '%')
                OR EXISTS (SELECT 1 FROM promotion WHERE banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM promotion_request WHERE suggested_banner_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM global_event WHERE cover_image_url LIKE '%/' || :key)
                OR EXISTS (SELECT 1 FROM federation_inquiry_attachment WHERE storage_key = :key)
            """, nativeQuery = true)
    boolean isReferenced(@Param("key") String storageKey);
}
