import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClubPhoto } from '@duing/types';
import { PhotoPickerDialog } from '../../../app/manage/clubs/[clubId]/photos/_components/PhotoPickerDialog';

function makePhoto(id: number): ClubPhoto {
  return { id, storageKey: `photo/${id}.jpg`, caption: null, width: null, height: null, displayOrder: id };
}

describe('PhotoPickerDialog', () => {
  it('I-7: 검증 에러는 닫았다 다시 열면 클리어된다', () => {
    const props = {
      photos: [makePhoto(10)],
      usedPhotoIds: [],
      onPick: () => {},
      onUploadNew: () => {},
      onClose: () => {},
    };
    const { rerender } = render(<PhotoPickerDialog open {...props} />);

    // 지원하지 않는 형식 → 검증 에러 표시.
    const fileInput = screen.getByLabelText('새 사진 업로드');
    const badFile = new File(['x'], 'a.gif', { type: 'image/gif' });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(screen.getByText(/지원하지 않는 이미지 형식입니다/)).toBeInTheDocument();

    // 닫고 다시 열면 이전 검증 에러가 남아 있지 않아야 한다.
    rerender(<PhotoPickerDialog open={false} {...props} />);
    rerender(<PhotoPickerDialog open {...props} />);
    expect(screen.queryByText(/지원하지 않는 이미지 형식입니다/)).not.toBeInTheDocument();
  });
});
