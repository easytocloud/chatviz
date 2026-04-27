import { useEffect } from 'react';
import type { CapturedMessage } from '../types';
import { FoldingJsonViewer } from './FoldingJsonViewer';
import type { JsonPath } from './FoldingJsonViewer';
import { MESSAGE_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';

interface Props {
  message: CapturedMessage;
  onClose: () => void;
}

function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

function computeFocusPath(msg: CapturedMessage): JsonPath {
  const raw = msg.raw_body as any;
  const messages: any[] = raw?.messages ?? [];

  switch (msg.message_type) {
    case 'user': {
      // Last user message whose content is a plain string (not tool results)
      const idx = findLastIndex(messages, (m) =>
        m.role === 'user' && (typeof m.content === 'string' || !Array.isArray(m.content))
      );
      return idx >= 0 ? ['messages', idx] : [];
    }

    case 'assistant': {
      const idx = findLastIndex(messages, (m) => m.role === 'assistant');
      if (idx < 0) return [];
      const content = messages[idx]?.content;
      if (!Array.isArray(content)) return ['messages', idx];
      // Find the text block whose text prefix matches this message's content
      const msgText = typeof (msg.content as any)?.text === 'string'
        ? (msg.content as any).text.slice(0, 40)
        : '';
      const blockIdx = msgText
        ? content.findIndex((b: any) => b.type === 'text' && b.text?.startsWith(msgText.slice(0, 20)))
        : content.findIndex((b: any) => b.type === 'text');
      return blockIdx >= 0 ? ['messages', idx, 'content', blockIdx] : ['messages', idx];
    }

    case 'tool_use': {
      const toolId = (msg.content as any)?.id;
      const idx = findLastIndex(messages, (m) => m.role === 'assistant');
      if (idx < 0) return [];
      const content = messages[idx]?.content;
      if (!Array.isArray(content)) return ['messages', idx];
      const blockIdx = toolId
        ? content.findIndex((b: any) => b.id === toolId)
        : content.findIndex((b: any) => b.type === 'tool_use');
      return blockIdx >= 0 ? ['messages', idx, 'content', blockIdx] : ['messages', idx];
    }

    case 'tool_result': {
      const toolUseId = msg.tool_use_id;
      const idx = findLastIndex(
        messages,
        (m) => m.role === 'user' && Array.isArray(m.content) &&
          m.content.some((b: any) => b.type === 'tool_result')
      );
      if (idx < 0) return [];
      const content = messages[idx]?.content;
      if (!Array.isArray(content)) return ['messages', idx];
      const blockIdx = toolUseId
        ? content.findIndex((b: any) => b.tool_use_id === toolUseId)
        : content.findIndex((b: any) => b.type === 'tool_result');
      return blockIdx >= 0 ? ['messages', idx, 'content', blockIdx] : ['messages', idx];
    }

    default:
      return [];
  }
}

export function JsonViewModal({ message, onClose }: Props) {
  const th = useTheme();
  const focusPath = computeFocusPath(message);
  const color = MESSAGE_COLORS[message.message_type];

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Modal panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '760px', maxWidth: '92vw',
          maxHeight: '80vh',
          background: th.bgPanel,
          border: `1px solid ${th.border}`,
          borderRadius: 10,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: `1px solid ${th.border}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.06em', color, background: color + '22',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {message.message_type.replace('_', ' ')}
          </span>
          <span style={{ fontSize: 11, color: th.textDimmer, fontFamily: 'monospace' }}>
            {message.model}
          </span>
          {focusPath.length > 0 && (
            <span style={{ fontSize: 10, color: th.textDimmer }}>
              → {focusPath.join('.')}
            </span>
          )}
          <button
            onClick={() => {
              const json = JSON.stringify(message.raw_body, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `chatviz-${message.message_type}-${message.request_id.slice(0, 8)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              marginLeft: 'auto', background: 'none',
              border: `1px solid ${th.border}`, borderRadius: 4,
              cursor: 'pointer', color: th.textDim,
              fontSize: 11, padding: '3px 10px', lineHeight: 1,
            }}
          >
            ↓ export
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: `1px solid ${th.border}`, borderRadius: 4,
              cursor: 'pointer', color: th.textDim,
              fontSize: 14, padding: '2px 8px', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Scrollable JSON body */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', flex: 1 }}>
          <FoldingJsonViewer data={message.raw_body} focusPath={focusPath} />
        </div>
      </div>
    </div>
  );
}
