import type { ReactNode } from 'react';
import { MESSAGE_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';
import type { Theme } from '../styles/theme';

export const XML_TAG_GLOSSARY: Record<string, string> = {
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

export function xmlTagLabel(tag: string): string {
  return XML_TAG_GLOSSARY[tag.toLowerCase()] ?? 'custom section';
}

export function renderInline(text: string, th: Theme) {
  const parts: (string | ReactNode)[] = [];
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

export function SystemPromptRenderer({ text }: { text: string }) {
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
