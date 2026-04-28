import { useState } from 'react';
import { MESSAGE_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';
import { SystemPromptRenderer } from './SystemPromptRenderer';
import { ToolsPanel } from './ToolsPanel';

// ── token estimation ──────────────────────────────────────────────────────────

export function estimateChars(text: string): number {
  return Math.max(1, text.replace(/\s+/g, ' ').length);
}

export function distributeTokens(segments: { chars: number }[], totalTokens: number): number[] {
  const totalChars = segments.reduce((s, g) => s + g.chars, 0);
  if (totalChars === 0) return segments.map(() => 0);
  return segments.map((seg) => Math.max(1, Math.round((seg.chars / totalChars) * totalTokens)));
}

export function maxContextForModel(model: string): number {
  const m = model.toLowerCase();
  if (m.includes('claude')) return 200000;
  if (m.includes('gpt-4o') || m.includes('gpt-4-turbo') || m.includes('o1') || m.includes('o3')) return 128000;
  if (m.includes('gpt-4')) return 8192;
  if (m.includes('gpt-3.5')) return 16385;
  if (m.includes('qwen') && (m.includes('72b') || m.includes('32b') || m.includes('coder'))) return 131072;
  if (m.includes('qwen2.5') || m.includes('qwen3')) return 131072;
  if (m.includes('qwen')) return 32768;
  if (m.includes('llama-3') || m.includes('llama3')) return 131072;
  if (m.includes('llama-2') || m.includes('llama2')) return 4096;
  if (m.includes('mistral') || m.includes('mixtral')) return 32768;
  if (m.includes('gemma')) return 8192;
  if (m.includes('deepseek')) return 65536;
  return 128000;
}

// ── segment helpers ───────────────────────────────────────────────────────────

export interface Segment {
  id: string;
  label: string;
  color: string;
  chars: number;
  tokens: number;
  preview: string;
  fullContent: string;
}

export function asText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trimStart();
  if (Array.isArray(val)) {
    return val
      .map((b: any) => b?.text ?? b?.content ?? (typeof b === 'string' ? b : JSON.stringify(b)))
      .filter(Boolean)
      .join('\n');
  }
  return val?.text ?? val?.content ?? JSON.stringify(val, null, 2);
}

export function buildSegments(raw: any, knownInputTokens?: number | null): Segment[] {
  const rawSegs: Omit<Segment, 'tokens'>[] = [];

  const system = raw?.system ?? raw?.messages?.find?.((m: any) => m.role === 'system')?.content;
  if (system) {
    const text = asText(system);
    rawSegs.push({
      id: 'system', label: 'System', color: MESSAGE_COLORS.system,
      chars: estimateChars(text),
      preview: text.replace(/\n+/g, ' ').slice(0, 120),
      fullContent: text,
    });
  }

  const messages: any[] = (raw?.messages ?? []).filter((m: any) => m.role !== 'system');
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const role: string = m.role ?? 'user';
    const blocks: any[] = Array.isArray(m.content) ? m.content : [];
    const hasToolUse = blocks.some((b: any) => b?.type === 'tool_use');
    const hasToolResult = blocks.some((b: any) => b?.type === 'tool_result');
    const effectiveType = hasToolUse ? 'tool_use' : (hasToolResult || role === 'tool') ? 'tool_result' : role;
    const text = asText(m.content);
    const colorMap: Record<string, string> = {
      user: MESSAGE_COLORS.user,
      assistant: MESSAGE_COLORS.assistant,
      tool: MESSAGE_COLORS.tool_result,
      tool_use: MESSAGE_COLORS.tool_use,
      tool_result: MESSAGE_COLORS.tool_result,
    };
    const isLatest = i === messages.length - 1;
    rawSegs.push({
      id: `msg-${i}`,
      label: isLatest ? `[${i}] ${effectiveType} ← latest` : `[${i}] ${effectiveType}`,
      color: colorMap[effectiveType] ?? '#6B7280',
      chars: estimateChars(text),
      preview: text.replace(/\n+/g, ' ').slice(0, 120),
      fullContent: text,
    });
  }

  const tools: any[] = raw?.tools ?? raw?.functions ?? [];
  if (tools.length > 0) {
    const text = JSON.stringify(tools, null, 2);
    rawSegs.push({
      id: 'tools', label: `Tools (${tools.length})`,
      color: MESSAGE_COLORS.tool_use,
      chars: estimateChars(text),
      preview: tools.map((t: any) => t.name ?? t.function?.name ?? '?').join(', '),
      fullContent: text,
    });
  }

  const tokenCounts = knownInputTokens
    ? distributeTokens(rawSegs, knownInputTokens)
    : rawSegs.map((s) => Math.max(1, Math.ceil(s.chars / 4)));

  return rawSegs.map((s, i) => ({ ...s, tokens: tokenCounts[i] }));
}

// ── context grid ──────────────────────────────────────────────────────────────

export const COLS = 20;
export const ROWS = 10;
export const TOTAL_SQUARES = COLS * ROWS;
export const SQ = 11;
export const GAP = 2;

export function ContextGrid({ raw, model, inputTokens }: { raw: any; model: string; inputTokens?: number | null }) {
  const th = useTheme();
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const segments = buildSegments(raw, inputTokens);
  const maxCtx = maxContextForModel(model);
  const usedTokens = segments.reduce((s, g) => s + g.tokens, 0);

  const usedSquares = Math.min(TOTAL_SQUARES, Math.round((usedTokens / maxCtx) * TOTAL_SQUARES));
  const squaresPerSeg = (() => {
    if (usedTokens === 0) return segments.map(() => 0);
    let allocated = 0;
    const counts = segments.map((seg, i) => {
      const r = (seg.tokens / usedTokens) * usedSquares;
      const count = i === segments.length - 1
        ? usedSquares - allocated
        : Math.max(1, Math.round(r));
      allocated += count;
      return count;
    });
    return counts;
  })();

  const squares: { segId: string; color: string }[] = [];
  segments.forEach((seg, i) => {
    for (let j = 0; j < squaresPerSeg[i]; j++) {
      squares.push({ segId: seg.id, color: seg.color });
    }
  });
  while (squares.length < TOTAL_SQUARES) {
    squares.push({ segId: '', color: '' });
  }

  const hoveredSeg = hovered ? segments.find((s) => s.id === hovered) : null;
  const expandedSeg = expanded ? segments.find((s) => s.id === expanded) : null;
  const pct = ((usedTokens / maxCtx) * 100).toFixed(1);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, ${SQ}px)`,
        gap: GAP,
        marginBottom: 10,
      }}>
        {squares.map((sq, i) => (
          <div
            key={i}
            title={sq.segId ? segments.find(s => s.id === sq.segId)?.preview : undefined}
            onMouseEnter={() => sq.segId && setHovered(sq.segId)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => sq.segId && setExpanded(expanded === sq.segId ? null : sq.segId)}
            style={{
              width: SQ, height: SQ, borderRadius: 2,
              background: sq.color
                ? (hovered === sq.segId ? sq.color : sq.color + 'BB')
                : th.bgBase,
              border: sq.color ? `1px solid ${sq.color}44` : `1px solid ${th.border}`,
              cursor: sq.segId ? 'pointer' : 'default',
              transition: 'background 0.08s',
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>

      <div style={{ minHeight: 32, marginBottom: 8 }}>
        {hoveredSeg ? (
          <div style={{ fontSize: 11, color: hoveredSeg.color, lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>{hoveredSeg.label}</span>
            {' — '}
            <span style={{ color: th.textMuted }}>{hoveredSeg.preview}{hoveredSeg.preview.length >= 120 ? '…' : ''}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: th.textGhost }}>
            {inputTokens ? '' : '~'}{usedTokens.toLocaleString()} tokens
            {inputTokens ? ' (exact)' : ' (estimated)'}
            {' · '}{pct}% of {(maxCtx / 1000).toFixed(0)}k context
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 12 }}>
        {segments.map((seg) => (
          <button
            key={seg.id}
            onClick={() => setExpanded(expanded === seg.id ? null : seg.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 1, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: expanded === seg.id ? seg.color : th.textDim }}>
              {seg.label}
            </span>
            <span style={{ fontSize: 10, color: th.textGhost }}>~{seg.tokens.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {expandedSeg && (
        <div style={{
          flex: 1, minHeight: 0,
          background: expandedSeg.color + th.tintBg,
          border: `1px solid ${expandedSeg.color}${th.tintBorder}`,
          borderRadius: 6, padding: '10px 12px',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {expandedSeg.id === 'system'
            ? <div style={{ flex: 1, overflow: 'auto' }}><SystemPromptRenderer text={expandedSeg.fullContent} /></div>
            : expandedSeg.id === 'tools'
              ? <ToolsPanel tools={raw?.tools ?? raw?.functions ?? []} fillHeight />
              : <div style={{ flex: 1, overflow: 'auto', fontSize: 12, color: th.textSecondary, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{expandedSeg.fullContent}</div>
          }
        </div>
      )}
    </div>
  );
}
