'use client';

import { useRef, useState } from 'react';
import { useCreatePhotoMutation, useFileUploadMutation } from '@duing/hooks';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';

type PhotoUploaderProps = {
  clubId: number;
};

export function PhotoUploader({ clubId }: PhotoUploaderProps) {
  const createPhoto = useCreatePhotoMutation(clubId);
  const uploadFile = useFileUploadMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setErrors([]);
    const failures: string[] = [];
    for (const file of Array.from(fileList)) {
      // 클라이언트 선검증 — 위반 시 서버 호출 없이 즉시 skip. 백엔드 정책(5MB / JPG·PNG·WEBP) 과 동일.
      const validationError = validateImageFile(file);
      if (validationError) {
        failures.push(`${file.name}: ${validationError}`);
        continue;
      }
      try {
        const uploaded = await uploadFile.mutateAsync({ file, purpose: 'PHOTO' });
        await createPhoto.mutateAsync({
          storageKey: uploaded.storageKey,
          caption: null,
          width: null,
          height: null,
        });
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : '업로드 실패'}`);
      }
    }
    setErrors(failures);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
        className="block text-sm"
      />
      <p className="text-xs text-slate-500">JPG · PNG · WEBP, 파일당 최대 5MB</p>
      {busy && <p className="text-sm text-slate-500">업로드 중…</p>}
      {errors.length > 0 && (
        <ul className="text-sm text-rose-600">
          {errors.map((message, idx) => <li key={idx}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}