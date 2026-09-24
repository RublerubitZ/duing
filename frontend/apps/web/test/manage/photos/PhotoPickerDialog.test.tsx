import { render, screen, fireEvent, within } from '@testing-library/react';
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
  it('busy 면 다이얼로그를 전송 중(aria-busy)으로 표기한다', () => {
    render(
      <PhotoPickerDialog
        open
        busy
        photos={[makePhoto(10)]}
        usedPhotoIds={[]}
        onPick={() => {}}
        onUploadNew={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  });
  it('busy 동안만 다이얼로그 안 status 리전에 업로드 중 안내를 싣는다', () => {
    const props = {
      photos: [makePhoto(10)],
      usedPhotoIds: [],
      onPick: () => {},
      onUploadNew: () => {},
      onClose: () => {},
    };
    const { rerender } = render(<PhotoPickerDialog open busy {...props} />);
    // dnd-kit 등 다른 status 리전과 섞이지 않게 다이얼로그 안으로 한정한다.
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('사진 올리는 중');

    rerender(<PhotoPickerDialog open busy={false} {...props} />);
    expect(within(screen.getByRole('dialog')).getByRole('status')).toBeEmptyDOMElement();
  });
});
