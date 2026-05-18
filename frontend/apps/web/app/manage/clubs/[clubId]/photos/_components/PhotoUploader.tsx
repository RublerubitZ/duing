'use client';

import { useRef, useState } from 'react';
import { useCreatePhotoMutation, useFileUploadMutation } from '@duing/hooks';

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
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files)}
        className="block text-sm"
      />
      {busy && <p className="text-sm text-slate-500">업로드 중…</p>}
      {errors.length > 0 && (
        <ul className="text-sm text-rose-600">
          {errors.map((message, idx) => <li key={idx}>{message}</li>)}
        </ul>
      )}
    </div>
  );
}