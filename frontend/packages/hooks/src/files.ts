import { useMutation } from '@tanstack/react-query';
import type { FilePurpose, FileUploadResult } from '@duing/types';
import { useApiClient } from './api-context';

export function useFileUploadMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ file, purpose }: { file: File; purpose: FilePurpose }): Promise<FileUploadResult> =>
      client.files.upload(file, purpose),
  });
}