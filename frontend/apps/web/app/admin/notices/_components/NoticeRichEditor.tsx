'use client';

import { useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { marked } from 'marked';
import {
  Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered,
  Quote, Link2, Image as ImageIcon, Undo2, Redo2,
} from 'lucide-react';
import { useFileUploadMutation } from '@duing/hooks';
import type { NoticeContentFormat } from '@duing/types';
import { IMAGE_UPLOAD_POLICY, validateImageFile } from '@/app/_components/imageUploadPolicy';
import { sanitizeNoticeHtml } from '../../../notices/_lib/sanitizeHtml';

const MAX_INLINE_IMAGES = 20;
const MARKDOWN_BLOCK = /(^|\n)\s*(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```)/;

function markdownToHtml(text: string): string {
  const parsed = marked.parse(text, { async: false });
  return typeof parsed === 'string' ? sanitizeNoticeHtml(parsed) : '';
}

function looksLikeMarkdown(text: string): boolean {
  // 실제 마크다운 블록 문법(제목·목록·인용·코드펜스)이 있을 때만 변환한다.
  // 일반 멀티라인 텍스트까지 marked 로 보내면 단일 줄바꿈이 합쳐져 줄이 사라지므로 includes('\n') 는 쓰지 않는다.
  return MARKDOWN_BLOCK.test(text);
}

function toInitialHtml(value: string, format: NoticeContentFormat): string {
  if (!value) return '';
  if (format === 'MARKDOWN') return markdownToHtml(value);
  return sanitizeNoticeHtml(value);
}

type Props = {
  value: string;
  format: NoticeContentFormat;
  onChange: (html: string) => void;
};

function ToolbarButton({ active, disabled, onClick, title, children }: {
  active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-md transition disabled:opacity-40 ${active ? 'bg-ink text-paper' : 'text-charcoal-2 hover:bg-sage-tint hover:text-ink'}`}
    >{children}</button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px self-center bg-line" />;
}

export function NoticeRichEditor({ value, format, onChange }: Props) {
  const uploadMutation = useFileUploadMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: toInitialHtml(value, format),
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onCreate: ({ editor: instance }) => onChange(instance.getHTML()),
    editorProps: {
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        // 리치 HTML 붙여넣기는 Tiptap 기본 처리에 맡긴다.
        if (clipboard.getData('text/html')) return false;
        const text = clipboard.getData('text/plain');
        if (!text || !looksLikeMarkdown(text)) return false;
        const current = editorRef.current;
        if (!current) return false;
        const html = markdownToHtml(text);
        if (!html) return false;
        current.chain().focus().insertContent(html).run();
        return true;
      },
    },
  });

  editorRef.current = editor;

  if (!editor) {
    return <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[13px] text-charcoal-3">에디터 로딩 중…</div>;
  }

  const imageCount = (instance: Editor): number => {
    let count = 0;
    instance.state.doc.descendants((node) => { if (node.type.name === 'image') count += 1; });
    return count;
  };

  const handleImageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    for (const file of Array.from(fileList)) {
      if (imageCount(editor) >= MAX_INLINE_IMAGES) {
        setError(`본문 이미지는 최대 ${MAX_INLINE_IMAGES}장까지 넣을 수 있습니다.`);
        break;
      }
      const validationError = validateImageFile(file);
      if (validationError) { setError(validationError); continue; }
      try {
        // TODO(orphan-image-gc): 본문에서 제거되거나 공지 삭제 시 미참조 업로드를 정리하는 후속 작업 필요
        const result = await uploadMutation.mutateAsync({ file, purpose: 'NOTICE_BODY' });
        editor.chain().focus().setImage({ src: result.url }).run();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : '이미지 업로드에 실패했습니다.');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setLink = () => {
    const linkAttrs = editor.getAttributes('link');
    const previous = typeof linkAttrs.href === 'string' ? linkAttrs.href : undefined;
    const url = window.prompt('링크 URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="rounded-xl border border-line bg-paper overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-cream/40 px-2 py-1.5">
        <ToolbarButton title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
        <ToolbarButton title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
        <ToolbarButton title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16} /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="제목 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
        <ToolbarButton title="제목 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolbarButton>
        <ToolbarButton title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
        <ToolbarButton title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
        <ToolbarButton title="인용" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="링크" active={editor.isActive('link')} onClick={setLink}><Link2 size={16} /></ToolbarButton>
        <ToolbarButton title="이미지" disabled={uploadMutation.isPending} onClick={() => fileInputRef.current?.click()}><ImageIcon size={16} /></ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton title="실행 취소" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolbarButton>
        <ToolbarButton title="다시 실행" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="notice-editor px-5 py-4 min-h-[320px] [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror]:text-[15.5px] [&_.ProseMirror]:leading-[1.8] [&_.ProseMirror]:text-charcoal [&_.ProseMirror_p]:my-2.5 [&_.ProseMirror_h2]:text-[21px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:text-ink-deep [&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:pl-3 [&_.ProseMirror_h2]:border-l-[3px] [&_.ProseMirror_h2]:border-sage [&_.ProseMirror_h3]:text-[17px] [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:text-ink-deep [&_.ProseMirror_h3]:mt-4 [&_.ProseMirror_h3]:mb-1.5 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-line [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-charcoal-2 [&_.ProseMirror_a]:text-ink [&_.ProseMirror_a]:underline [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-3"
      />
      <input
        ref={fileInputRef}
        data-testid="rich-editor-image-input"
        type="file"
        multiple
        accept={IMAGE_UPLOAD_POLICY.acceptAttribute}
        className="hidden"
        onChange={(changeEvent) => { void handleImageFiles(changeEvent.target.files); }}
      />
      <p className="px-5 pb-2.5 text-[11.5px] text-charcoal-3">서식 버튼으로 꾸미거나 마크다운을 붙여넣으면 자동 변환됩니다 · 이미지는 본문에 인라인 삽입(최대 {MAX_INLINE_IMAGES}장·5MB)</p>
      {error && <p className="px-5 pb-2.5 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
