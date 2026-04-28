import { useState } from 'react';
import { MESSAGE_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';
import { SystemPromptRenderer } from './SystemPromptRenderer';

export interface ParsedTool {
  fullName: string;
  shortName: string;
  server: string | null;
  firstLine: string;
  fullDesc: string;
}

export function parseTool(t: any): ParsedTool {
  const fullName: string = t.name ?? t.function?.name ?? '?';
  const desc: string = t.description ?? t.function?.description ?? '';
  const firstLine = desc.split('\n').find(l => l.trim()) ?? '';
  const mcpMatch = fullName.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (mcpMatch) {
    return { fullName, shortName: mcpMatch[2], server: mcpMatch[1], firstLine, fullDesc: desc };
  }
  return { fullName, shortName: fullName, server: null, firstLine, fullDesc: desc };
}

function ToolRow({ tool, color, selected, onSelect }: {
  tool: ParsedTool;
  color: string;
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const isActive = selected === tool.fullName;
  const th = useTheme();
  return (
    <div
      title={tool.firstLine || undefined}
      onClick={() => onSelect(isActive ? null : tool.fullName)}
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

export function ToolsPanel({ tools, fillHeight }: { tools: any[]; fillHeight?: boolean }) {
  const th = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  const parsed = tools.map(parseTool);
  const systemTools = parsed.filter(t => t.server === null);
  const mcpServers = [...new Set(parsed.filter(t => t.server !== null).map(t => t.server as string))].sort();
  const selectedTool = parsed.find(t => t.fullName === selected) ?? null;
  const color = MESSAGE_COLORS.tool_use;

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
              {systemTools.map(t => <ToolRow key={t.fullName} tool={t} color={color} selected={selected} onSelect={setSelected} />)}
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
                {serverTools.map(t => <ToolRow key={t.fullName} tool={t} color={color} selected={selected} onSelect={setSelected} />)}
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
