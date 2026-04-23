import { useState } from 'react';
import type { CapturedMessage } from '../types';
import { MESSAGE_COLORS, FAMILY_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';
import type { Theme } from '../styles/theme';

interface Props {
  message: CapturedMessage;
  onClose: () => void;
}

// ── token estimation ──────────────────────────────────────────────────────────

function estimateChars(text: string): number {
  return Math.max(1, text.replace(/\s+/g, ' ').length);
}

function distributeTokens(segments: { chars: number }[], totalTokens: number): number[] {
  const totalChars = segments.reduce((s, g) => s + g.chars, 0);
  if (totalChars === 0) return segments.map(() => 0);
  return segments.map((seg) => Math.max(1, Math.round((seg.chars / totalChars) * totalTokens)));
}

function maxContextForModel(model: string): number {
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

interface Segment {
  id: string;
  label: string;
  color: string;
  chars: number;
  tokens: number;
  preview: string;
  fullContent: string;
}

function asText(val: any): string {
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

function buildSegments(raw: any, knownInputTokens?: number | null): Segment[] {
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

const COLS = 20;
const ROWS = 10;
const TOTAL_SQUARES = COLS * ROWS;
const SQ = 11;
const GAP = 2;

function ContextGrid({ raw, model, inputTokens }: { raw: any; model: string; inputTokens?: number | null }) {
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

// ── system prompt renderer (markdown + XML tags) ─────────────────────────────

const XML_TAG_GLOSSARY: Record<string, string> = {
  types: 'type enum block',
  type: 'individual type definition',
  name: 'identifier',
  description: 'explanatory text',
  when_to_save: 'trigger condition',
  how_to_use: 'usage guidance',
  examples: 'example block',
  example: 'single example',
  body_structure: 'content shape guidance',
  functions: 'function list',
  function: 'function definition',
  tools: 'tool list',
  tool: 'tool definition',
  context: 'contextual section',
  system: 'system-level block',
  instructions: 'instruction block',
  rules: 'rule set',
  rule: 'individual rule',
};

function xmlTagLabel(tag: string): string {
  return XML_TAG_GLOSSARY[tag.toLowerCase()] ?? 'custom section';
}

function renderInline(text: string, th: Theme): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('`'))
      parts.push(<code key={m.index} style={{ background: th.bgSelectedLeft, color: '#93C5FD', padding: '1px 4px', borderRadius: 3, fontSize: '0.9em', fontFamily: 'monospace' }}>{raw.slice(1, -1)}</code>);
    else if (raw.startsWith('**'))
      parts.push(<strong key={m.index} style={{ color: th.textBright }}>{raw.slice(2, -2)}</strong>);
    else
      parts.push(<em key={m.index} style={{ color: th.textSecondary }}>{raw.slice(1, -1)}</em>);
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function SystemPromptRenderer({ text }: { text: string }) {
  const th = useTheme();
  const lines = text.split('\n');
  const segments: { kind: 'text' | 'xml'; lines: string[] }[] = [];
  let cur: { kind: 'text' | 'xml'; lines: string[] } = { kind: 'text', lines: [] };

  for (const line of lines) {
    const isXml = /^\s*<\/?[\w-]/.test(line);
    const kind = isXml ? 'xml' : 'text';
    if (kind !== cur.kind) {
      if (cur.lines.some(l => l.trim())) segments.push(cur);
      cur = { kind, lines: [] };
    }
    cur.lines.push(line);
  }
  if (cur.lines.some(l => l.trim())) segments.push(cur);

  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.7, color: th.textSecondary }}>
      {segments.map((seg, si) => {
        if (seg.kind === 'xml') {
          const tagMatch = seg.lines.find(l => /^\s*<[\w-]/.test(l))?.match(/<([\w-]+)/);
          const tag = tagMatch?.[1] ?? '';
          const gloss = tag ? xmlTagLabel(tag) : '';
          return (
            <div key={si} style={{
              margin: '8px 0',
              border: `1px solid #F59E0B${th.tintBorder}`,
              borderRadius: 6,
              overflow: 'hidden',
            }}>
              {tag && (
                <div style={{
                  background: th.bgAmberHeader, padding: '3px 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  borderBottom: `1px solid #F59E0B33`,
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>
                    &lt;{tag}&gt;
                  </span>
                  {gloss && (
                    <span style={{ fontSize: 10, color: th.textDim, fontStyle: 'italic' }}>{gloss}</span>
                  )}
                </div>
              )}
              <pre style={{
                margin: 0, padding: '8px 12px',
                fontFamily: 'monospace', fontSize: 11,
                color: '#D97706', background: th.bgAmber,
                whiteSpace: 'pre-wrap', overflowX: 'auto',
              }}>
                {seg.lines.join('\n').trim()}
              </pre>
            </div>
          );
        }

        return (
          <div key={si}>
            {seg.lines.map((line, li) => {
              if (!line.trim()) return <div key={li} style={{ height: 6 }} />;
              if (/^#{1,3} /.test(line)) {
                const level = line.match(/^(#+)/)?.[1].length ?? 1;
                const txt = line.replace(/^#+\s*/, '');
                const sizes = [null, '1em', '0.95em', '0.88em'];
                return (
                  <div key={li} style={{
                    fontWeight: 700, fontSize: sizes[level] ?? '1em',
                    color: MESSAGE_COLORS.system, margin: '10px 0 2px',
                    borderBottom: level === 1 ? `1px solid ${MESSAGE_COLORS.system}33` : 'none',
                    paddingBottom: level === 1 ? 4 : 0,
                  }}>
                    {renderInline(txt, th)}
                  </div>
                );
              }
              if (/^[-*] /.test(line)) {
                return (
                  <div key={li} style={{ paddingLeft: 14, position: 'relative', marginBottom: 2 }}>
                    <span style={{ position: 'absolute', left: 4, color: MESSAGE_COLORS.system, opacity: 0.6 }}>•</span>
                    {renderInline(line.replace(/^[-*] /, ''), th)}
                  </div>
                );
              }
              return <div key={li}>{renderInline(line, th)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── tools panel ──────────────────────────────────────────────────────────────

interface ParsedTool {
  fullName: string;
  shortName: string;
  server: string | null;
  firstLine: string;
  fullDesc: string;
}

function parseTool(t: any): ParsedTool {
  const fullName: string = t.name ?? t.function?.name ?? '?';
  const desc: string = t.description ?? t.function?.description ?? '';
  const firstLine = desc.split('\n').find(l => l.trim()) ?? '';
  const mcpMatch = fullName.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (mcpMatch) {
    return { fullName, shortName: mcpMatch[2], server: mcpMatch[1], firstLine, fullDesc: desc };
  }
  return { fullName, shortName: fullName, server: null, firstLine, fullDesc: desc };
}

function ToolsPanel({ tools, fillHeight }: { tools: any[]; fillHeight?: boolean }) {
  const th = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  const parsed = tools.map(parseTool);
  const systemTools = parsed.filter(t => t.server === null);
  const mcpServers = [...new Set(parsed.filter(t => t.server !== null).map(t => t.server as string))].sort();
  const selectedTool = parsed.find(t => t.fullName === selected) ?? null;
  const color = MESSAGE_COLORS.tool_use;

  function ToolRow({ tool }: { tool: ParsedTool }) {
    const isActive = selected === tool.fullName;
    return (
      <div
        title={tool.firstLine || undefined}
        onClick={() => setSelected(isActive ? null : tool.fullName)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          background: isActive ? color + '22' : 'transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = color + '11'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <span style={{ fontSize: 11, color: isActive ? '#FCD34D' : th.textMuted, fontFamily: 'monospace' }}>
          {tool.shortName}
        </span>
        {tool.firstLine && (
          <span style={{ fontSize: 10, color: th.textDimmer, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {tool.firstLine}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...(fillHeight ? { flex: 1, minHeight: 0 } : {}) }}>
      <div style={{ background: color + '0A', border: `1px solid ${color}22`, borderRadius: 6, overflow: 'hidden', ...(fillHeight ? { flex: 1, minHeight: 0, overflowY: 'auto' } : { maxHeight: 260, overflowY: 'auto' }) }}>
        {systemTools.length > 0 && (
          <div>
            <div style={{ padding: '5px 10px', background: color + '15', borderBottom: `1px solid ${color}22`, position: 'sticky', top: 0, zIndex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                System · {systemTools.length}
              </span>
            </div>
            <div style={{ padding: '4px 2px' }}>
              {systemTools.map(t => <ToolRow key={t.fullName} tool={t} />)}
            </div>
          </div>
        )}
        {mcpServers.map((server, si) => {
          const serverTools = parsed.filter(t => t.server === server);
          return (
            <div key={server} style={{ borderTop: si === 0 && systemTools.length === 0 ? 'none' : `1px solid ${color}22` }}>
              <div style={{ padding: '5px 10px', background: th.bgAmberHeader, borderBottom: `1px solid ${color}22`, display: 'flex', alignItems: 'center', gap: 6, position: 'sticky', top: 0, zIndex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  mcp: {server}
                </span>
                <span style={{ fontSize: 10, color: th.textDimmer }}>{serverTools.length}</span>
              </div>
              <div style={{ padding: '4px 2px' }}>
                {serverTools.map(t => <ToolRow key={t.fullName} tool={t} />)}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTool && (
        <div style={{
          background: th.bgAmber,
          border: `1px solid ${color}${th.tintBorder}`, borderRadius: 6, padding: '10px 12px',
        }}>
          <div style={{ fontSize: 11, color: '#FCD34D', fontFamily: 'monospace', fontWeight: 700, marginBottom: 6 }}>
            {selectedTool.server && <span style={{ color: '#F59E0B', marginRight: 4 }}>{selectedTool.server} /</span>}
            {selectedTool.shortName}
          </div>
          {selectedTool.fullDesc
            ? <SystemPromptRenderer text={selectedTool.fullDesc} />
            : <span style={{ fontSize: 11, color: th.textDimmer, fontStyle: 'italic' }}>No description</span>}
        </div>
      )}
    </div>
  );
}

// ── shared content renderer ───────────────────────────────────────────────────

function renderBlock(block: any, key: number, th: Theme): React.ReactNode {
  const t = block?.type ?? 'text';
  if (t === 'text') {
    return <SystemPromptRenderer key={key} text={(block.text ?? '').trimStart()} />;
  }
  if (t === 'tool_use') {
    return (
      <div key={key} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: MESSAGE_COLORS.tool_use, fontWeight: 700, marginBottom: 2 }}>⚙ {block.name}</div>
        <pre style={{ margin: 0, fontSize: 11, color: '#FCD34D', background: th.bgAmberHeader, padding: '6px 8px', borderRadius: 4, overflowX: 'auto' }}>
          {JSON.stringify(block.input, null, 2)}
        </pre>
      </div>
    );
  }
  if (t === 'tool_result') {
    return (
      <div key={key} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: MESSAGE_COLORS.tool_result, fontWeight: 700, marginBottom: 2 }}>↩ tool_result</div>
        <pre style={{ margin: 0, fontSize: 11, color: th.textMuted, background: th.bgSunken, padding: '6px 8px', borderRadius: 4, overflowX: 'auto' }}>
          {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
        </pre>
      </div>
    );
  }
  return <pre key={key} style={{ margin: 0, fontSize: 11, color: th.textMuted, overflowX: 'auto' }}>{JSON.stringify(block, null, 2)}</pre>;
}

function renderContent(content: any, th: Theme): React.ReactNode {
  if (!content) return <span style={{ color: th.textDimmer, fontStyle: 'italic' }}>(empty)</span>;
  if (typeof content === 'string') {
    return <SystemPromptRenderer text={content.trimStart()} />;
  }
  if (Array.isArray(content)) {
    return <>{(content as any[]).map((block, i) => renderBlock(block, i, th))}</>;
  }
  if (typeof content === 'object' && content.type) {
    return renderBlock(content, 0, th);
  }
  return <pre style={{ margin: 0, fontSize: 11, color: th.textMuted, overflowX: 'auto' }}>{JSON.stringify(content, null, 2)}</pre>;
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color, padding: '12px 0 6px', borderTop: `1px solid ${color}22`, marginTop: 8,
    }}>
      {label}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export function MessageCard({ message, onClose }: Props) {
  const th = useTheme();
  const raw = message.raw_body as any;
  const familyColor = FAMILY_COLORS[message.api_family];
  const ts = new Date(message.timestamp).toLocaleTimeString();
  const isRequest = message.direction === 'request';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${th.border}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: th.bgPanel,
      }}>
        <span style={{
          background: familyColor + '22', color: familyColor,
          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          {message.api_family}
        </span>
        <span style={{
          color: th.textDimmer, fontSize: 11, fontFamily: 'monospace',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {message.model}
        </span>
        <span style={{ color: th.textGhost, fontSize: 11, flexShrink: 0 }}>{ts}</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: th.textDimmer, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 0 0 4px', flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflow: isRequest ? 'hidden' : 'auto',
        display: isRequest ? 'flex' : 'block', flexDirection: 'column',
        padding: '12px 14px 20px', background: th.bgPanel,
      }}>
        {isRequest ? (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: th.textGhost, marginBottom: 10, flexShrink: 0 }}>
              Context sent in this call
            </div>
            <ContextGrid raw={raw} model={message.model} inputTokens={message.input_tokens} />
          </>
        ) : (
          <>
            {/* System */}
            {(() => {
              const sys = raw?.system ?? raw?.messages?.find?.((m: any) => m.role === 'system')?.content;
              if (!sys) return null;
              const color = MESSAGE_COLORS.system;
              return (
                <>
                  <SectionHeader label="System prompt" color={color} />
                  <div style={{ background: color + th.tintBg, border: `1px solid ${color}${th.tintBorder}`, borderRadius: 6, padding: '10px 12px' }}>
                    <SystemPromptRenderer text={asText(sys)} />
                  </div>
                </>
              );
            })()}

            {/* Conversation history */}
            {(() => {
              const msgs = (raw?.messages ?? []).filter((m: any) => m.role !== 'system');
              if (!msgs.length) return null;
              return (
                <>
                  <SectionHeader label={`Context (${msgs.length} messages)`} color={th.textGhost} />
                  {msgs.map((m: any, i: number) => {
                    const role: string = m.role ?? 'user';
                    const colorMap: Record<string, string> = {
                      user: MESSAGE_COLORS.user,
                      assistant: MESSAGE_COLORS.assistant,
                      tool: MESSAGE_COLORS.tool_result,
                    };
                    const color = colorMap[role] ?? th.textDim;
                    return (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                          [{i}] {role}
                        </div>
                        <div style={{ background: color + th.tintBg, borderLeft: `2px solid ${color}55`, borderRadius: '0 6px 6px 0', padding: '8px 10px', fontSize: 12, lineHeight: 1.6 }}>
                          {renderContent(m.content, th)}
                        </div>
                      </div>
                    );
                  })}
                </>
              );
            })()}

            {/* Tools */}
            {(() => {
              const tools: any[] = raw?.tools ?? raw?.functions ?? [];
              if (!tools.length) return null;
              const color = MESSAGE_COLORS.tool_use;
              return (
                <>
                  <SectionHeader label={`Tools available (${tools.length})`} color={color} />
                  <ToolsPanel tools={tools} />
                </>
              );
            })()}

            {/* Response */}
            <SectionHeader label="Response" color={MESSAGE_COLORS.assistant} />
            <div style={{
              background: MESSAGE_COLORS.assistant + th.tintBg,
              border: `1px solid ${MESSAGE_COLORS.assistant}${th.tintBorder}`,
              borderRadius: 6, padding: '10px 12px', fontSize: 12, lineHeight: 1.6,
            }}>
              {renderContent(message.content, th)}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '6px 14px', borderTop: `1px solid ${th.border}`, fontSize: 10, color: th.textGhost, flexShrink: 0, display: 'flex', gap: 12, background: th.bgPanel }}>
        <span>{message.direction}</span>
        <span>req {message.request_id.slice(0, 8)}</span>
      </div>
    </div>
  );
}
