import { MESSAGE_COLORS } from '../styles/colors';
import type { Theme } from '../styles/theme';
import { SystemPromptRenderer } from './SystemPromptRenderer';

export function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      color, padding: '12px 0 6px', borderTop: `1px solid ${color}22`, marginTop: 8,
    }}>
      {label}
    </div>
  );
}

export function renderBlock(block: any, key: number, th: Theme) {
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

export function renderContent(content: any, th: Theme) {
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
