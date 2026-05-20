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
  const [fileLabel, setFileLabel] = useState('선택된 파일 없음');
  const [hasFiles, setHasFiles] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      setFileLabel('선택된 파일 없음');
      setHasFiles(false);
      return;
    }

    const displayLabel =
      fileList.length === 1 ? fileList[0].name : `${fileList.length}개 파일 선택됨`;
    setFileLabel(displayLabel);
    setHasFiles(true);
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
    setFileLabel('선택된 파일 없음');
    setHasFiles(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="mb-7">
      <div className="flex items-center gap-3">
        <label
          htmlFor="photo-file-input"
          className={[
            'inline-flex items-center gap-2',
            'bg-[#3e5b34] hover:bg-[#4a6b3f] active:translate-y-px',
            'text-[#f6f1dd] border border-[#3e5b34] rounded-[8px]',
            'px-[18px] py-[10px] text-[13.5px] font-semibold',
            'cursor-pointer select-none',
            'shadow-[0_1px_0_rgba(0,0,0,0.04),0_4px_12px_rgba(62,91,52,0.18)]',
            'transition-colors',
            busy ? 'opacity-60 pointer-events-none' : '',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-[14px] h-[14px] shrink-0"
          >
            <path d="M8 3v8M4 7l4-4 4 4" />
            <path d="M3 13h10" />
          </svg>
          파일 선택
        </label>

        {/* visually hidden native file input */}
        <input
          ref={inputRef}
          id="photo-file-input"
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(changeEvent) => handleFiles(changeEvent.target.files)}
          className="absolute w-px h-px opacity-0 overflow-hidden pointer-events-none"
          aria-hidden="true"
          tabIndex={-1}
        />

        <span
          className={`text-[13px] ${hasFiles || busy ? 'text-[#4a5247] font-medium' : 'text-[#8a8f83]'}`}
        >
          {busy ? '업로드 중…' : fileLabel}
        </span>
      </div>

      {errors.length > 0 && (
        <ul className="mt-2 text-[13px] text-[#b35a3a] space-y-0.5">
          {errors.map((message, idx) => (
            <li key={idx}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
