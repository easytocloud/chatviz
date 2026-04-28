import type { CapturedMessage } from '../types';
import { MESSAGE_COLORS, FAMILY_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';
import { ContextGrid, asText } from './ContextGrid';
import { SystemPromptRenderer } from './SystemPromptRenderer';
import { ToolsPanel } from './ToolsPanel';
import { SectionHeader, renderContent } from './ToolMessagePanel';

interface Props {
  message: CapturedMessage;
  onClose: () => void;
}

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
