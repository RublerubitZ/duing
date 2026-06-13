'use client';

import { useRef, useState } from 'react';
import { useFileUploadMutation } from '@duing/hooks';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { ImageWithFallback } from '@/app/_components/ImageWithFallback';

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
};

export function NoticeBodyImagesUploader({ value, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrors([]);
    const failures: string[] = [];
    const uploadedUrls: string[] = [];
    for (const file of Array.from(fileList)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        failures.push(`${file.name}: ${validationError}`);
        continue;
      }
      try {
        const result = await uploadMutation.mutateAsync({ file, purpose: 'NOTICE_BODY' });
        uploadedUrls.push(result.url);
      } catch (uploadError) {
        failures.push(`${file.name}: ${uploadError instanceof Error ? uploadError.message : '업로드 실패'}`);
      }
    }
    if (uploadedUrls.length > 0) onChange([...value, ...uploadedUrls]);
    setErrors(failures);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (index: number) => onChange(value.filter((_, itemIndex) => itemIndex !== index));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    onChange(
      value.map((url, mapIndex) => {
        if (mapIndex === index) return value[target] ?? url;
        if (mapIndex === target) return value[index] ?? url;
        return url;
      }),
    );
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((url, index) => (
            <li key={`${url}-${index}`} className="flex items-center gap-3">
              <ImageWithFallback
                src={url}
                alt={`본문 이미지 ${index + 1}`}
                className="w-16 h-16 rounded-md overflow-hidden border border-line shrink-0"
              />
              <span className="flex-1 text-[12px] text-charcoal-2 truncate">{url}</span>
              <div className="flex gap-1">
                <button type="button" aria-label="위로 이동" onClick={() => move(index, -1)} disabled={index === 0}
                  className="px-2 py-1 rounded-md border border-line text-[12px] disabled:opacity-40">↑</button>
                <button type="button" aria-label="아래로 이동" onClick={() => move(index, 1)} disabled={index === value.length - 1}
                  className="px-2 py-1 rounded-md border border-line text-[12px] disabled:opacity-40">↓</button>
                <button type="button" aria-label="본문 이미지 제거" onClick={() => removeAt(index)}
                  className="px-2 py-1 rounded-md text-[12px] text-charcoal-2 hover:bg-graysoft">제거</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        data-testid="body-images-input"
        type="file"
        multiple
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        className="hidden"
        onChange={(changeEvent) => { void handleFiles(changeEvent.target.files); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploadMutation.isPending}
        className="px-3 py-1.5 rounded-md bg-paper border border-line text-[13px] font-semibold hover:border-ink disabled:opacity-50"
      >
        {uploadMutation.isPending ? '업로드 중…' : '본문 이미지 추가'}
      </button>
      <p className="text-[11.5px] text-charcoal-3">올린 비율 그대로 본문에 표시됩니다 · JPG · PNG · WEBP, 파일당 5MB</p>
      {errors.map((error) => (
        <p key={error} className="text-red-500 text-[12px]">{error}</p>
      ))}
    </div>
  );
}
