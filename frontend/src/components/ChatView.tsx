import { useRef, useEffect } from 'react';
import type { CapturedMessage } from '../types';
import { MESSAGE_COLORS, FAMILY_COLORS } from '../styles/colors';
import { useMessageStore } from '../store/messages';
import { useTheme } from '../styles/theme';
import { isInjected, contentPreview } from '../utils/messageHelpers';

interface Props {
  messages: CapturedMessage[];
}

// Only show the actual dialog turns — the system prompt lives in the detail panel
const VISIBLE_TYPES = new Set(['user', 'assistant', 'tool_use', 'tool_result']);

function isLeft(msg: CapturedMessage): boolean {
  return msg.message_type === 'user' || msg.message_type === 'tool_result';
}

export function ChatView({ messages }: Props) {
  const th = useTheme();
  const selectedId = useMessageStore((s) => s.selectedId);
  const setSelected = useMessageStore((s) => s.setSelected);
  const setJsonView = useMessageStore((s) => s.setJsonView);
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = messages.filter((m) => VISIBLE_TYPES.has(m.message_type));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visible.length]);

  if (visible.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: th.textDimmer, fontSize: 14,
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 28, color: th.border }}>◎</div>
        <span>Waiting for messages…</span>
        <span style={{ fontSize: 12, color: th.border }}>
          Set your agent's endpoint to{' '}
          <code style={{ color: th.textDim, background: th.bgSurface, padding: '2px 6px', borderRadius: 4 }}>
            http://localhost:7890
          </code>
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {visible.map((msg) => {
        const left = isLeft(msg);
        const color = MESSAGE_COLORS[msg.message_type];
        const isSelected = msg.id === selectedId;
        const preview = contentPreview(msg.content);
        const isToolMsg = msg.message_type === 'tool_use' || msg.message_type === 'tool_result';
        const injected = !isToolMsg && isInjected(preview);

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isToolMsg ? 'stretch' : (left ? 'flex-start' : 'flex-end'),
              padding: isToolMsg ? '1px 0' : '4px 20px',
              margin: isToolMsg ? '0 15%' : 0,
            }}
          >
            {/* Label row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
              flexDirection: isToolMsg ? 'row' : (left ? 'row' : 'row-reverse'),
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.06em', color, opacity: 0.7,
              }}>
                {msg.message_type.replace('_', ' ')}
              </span>
              {injected && (
                <span style={{ fontSize: 10, color: th.textDimmer, fontStyle: 'italic' }}>injected</span>
              )}
              {msg.direction === 'response' && (
                <span style={{ fontSize: 10, color: FAMILY_COLORS[msg.api_family], fontWeight: 600 }}>
                  {msg.api_family} ·{' '}
                  <span style={{ color: th.textDimmer, fontFamily: 'monospace', fontWeight: 400 }}>
                    {msg.model.length > 30 ? msg.model.slice(0, 28) + '…' : msg.model}
                  </span>
                </span>
              )}
              {msg.mcp_server && (
                <span style={{ fontSize: 10, color: '#F59E0B' }}>mcp:{msg.mcp_server}</span>
              )}
            </div>

            {/* Bubble */}
            <div
              onClick={() => setSelected(isSelected ? null : msg.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setJsonView(msg.id); }}
              style={{
                maxWidth: isToolMsg ? '100%' : '74%',
                padding: isToolMsg ? '6px 12px' : '10px 14px',
                borderRadius: left ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                background: isSelected
                  ? (left ? th.bgSelectedLeft : th.bgSelectedRight)
                  : th.bgBubble,
                border: `1.5px solid ${isSelected ? color : color + '44'}`,
                cursor: 'pointer',
                transition: 'border-color 0.12s, background 0.12s',
                opacity: isToolMsg ? 0.8 : injected ? 0.55 : 1,
                fontFamily: injected ? 'monospace' : 'inherit',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = color + '99';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = color + '44';
              }}
            >
              {msg.message_type === 'tool_use' && (
                <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 2, fontFamily: 'monospace' }}>
                  ⚙ {(msg.content as any)?.name ?? 'tool call'}
                </div>
              )}
              {msg.message_type === 'tool_result' && (
                <div style={{ fontSize: 11, color: th.textDim, marginBottom: 2 }}>↩ tool result</div>
              )}
              <p style={{
                margin: 0,
                fontSize: isToolMsg ? 11 : 13,
                lineHeight: 1.55,
                color: isToolMsg ? th.textDim : th.textSecondary,
                whiteSpace: 'pre-wrap',
                display: '-webkit-box',
                WebkitLineClamp: isSelected ? undefined : (isToolMsg ? 2 : 6),
                WebkitBoxOrient: 'vertical' as any,
                overflow: isSelected ? 'visible' : 'hidden',
                fontFamily: isToolMsg ? 'monospace' : 'inherit',
              }}>
                {preview || '(empty)'}
              </p>
              {!isSelected && preview.length > 280 && !isToolMsg && (
                <span style={{ fontSize: 11, color: color + 'AA', marginTop: 4, display: 'block' }}>
                  click to see full context →
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
