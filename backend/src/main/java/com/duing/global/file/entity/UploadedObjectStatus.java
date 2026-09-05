package com.duing.global.file.entity;

/**
 * 업로드 객체 추적 상태(스펙 §2.1).
 * <ul>
 *   <li>PENDING — 업로드됐지만 아직 어떤 엔티티에도 연결되지 않음(파기 후보)</li>
 *   <li>ACTIVE — 엔티티에 연결됨(종단)</li>
 *   <li>PURGING — 파기 잡이 claim 함. 스토리지 삭제 미확정 상태로, 다음 실행이 재시도한다</li>
 *   <li>PURGED — 스토리지 삭제 확정(종단). 행은 보존한다</li>
 * </ul>
 */
public enum UploadedObjectStatus {
    PENDING,
    ACTIVE,
    PURGING,
    PURGED
}
