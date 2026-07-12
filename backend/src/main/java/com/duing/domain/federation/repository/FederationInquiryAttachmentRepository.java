package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiryAttachment;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationInquiryAttachmentRepository extends JpaRepository<FederationInquiryAttachment, Long> {

    // answerId IS NULL — 질문 측 첨부만 조회한다. answerId 슬롯은 답변 첨부(후속 기능) 전용이라
    // 지금은 항상 null 이지만, 그 기능이 이 테이블을 그대로 재사용할 경우 문의 상세 응답에 답변
    // 첨부가 섞여 나오는 것을 미리 막아둔다.
    List<FederationInquiryAttachment> findAllByInquiryIdAndAnswerIdIsNullOrderBySortOrderAsc(Long inquiryId);

    // 다운로드 권한 검증 후 단건 조회 — inquiryId 불일치(다른 문의의 첨부 id 주입)는 결과 없음으로
    // 걸러진다. @SQLRestriction(deleted_at IS NULL) 이 soft delete 된 첨부도 함께 제외한다.
    Optional<FederationInquiryAttachment> findByIdAndInquiryId(Long id, Long inquiryId);

    /**
     * 파기 대상 첨부(id, storage_key)를 조회한다 — 교체로 고아가 된 첨부(attachment.deleted_at <
     * cutoff — replaceAttachments 가 남긴 "고아 객체 정리는 후속 파기 배치 몫" 주석의 그 후속) +
     * 파기 대상 문의에 딸린 아직 살아있는 첨부(소속 inquiry.deleted_at < cutoff, 첨부 자체는 live)를
     * 함께 포함한다 — 후자를 빼면 문의가 파기돼도 그 첨부의 스토리지 객체·행이 영구히 남는다.
     * @SQLRestriction 이 가리는 soft-delete 행(전자)까지 봐야 하므로 native 필수.
     */
    @Query(value = "SELECT a.id AS id, a.storage_key AS storageKey FROM federation_inquiry_attachment a "
            + "JOIN federation_inquiry i ON i.id = a.inquiry_id "
            + "WHERE a.deleted_at < :cutoff OR i.deleted_at < :cutoff "
            // 처리 순서 결정화 — 개별 실패 후 "다음 첨부 계속 처리" 계약을 순서 우연 없이 검증 가능하게 한다.
            + "ORDER BY a.id ASC",
            nativeQuery = true)
    List<FederationInquiryAttachmentPurgeTarget> findPurgeTargets(@Param("cutoff") LocalDateTime cutoff);

    /**
     * 파기 잡 한정 물리 삭제 예외 — 스토리지 객체 삭제에 성공한 뒤 storage_key 만 남은 행은 보관
     * 가치가 없다(email_verifications·notification 물리 삭제 전례). soft-delete 개념(@SQLDelete)이
     * 있는 엔티티지만, 호출측(FederationInquiryPurgeJob)이 스토리지 delete 성공을 확인한 뒤에만
     * 호출해야 하는 이 배치 전용 예외다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM federation_inquiry_attachment WHERE id = :id", nativeQuery = true)
    void hardDeleteById(@Param("id") Long id);
}
