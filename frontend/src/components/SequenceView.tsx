import type { CapturedMessage } from '../types';
import { useMessageStore } from '../store/messages';
import { useTheme } from '../styles/theme';
import { MESSAGE_COLORS } from '../styles/colors';

interface Props {
  messages: CapturedMessage[];
}

const VISIBLE = new Set(['user', 'assistant', 'tool_use', 'tool_result']);
const HEADER_H = 76;
const ROW_H = 68;
const COL_W = 180;
const BOX_W = 140;
const BOX_H = 36;

// Colors for agent columns — index 0 is always the single-agent / first-agent color
const AGENT_COLORS = ['#10B981', '#6366F1', '#EC4899', '#14B8A6', '#F97316'];
const TOOL_COLOR = '#F59E0B';
const USER_COLOR = '#3B82F6';

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function isInjected(text: string): boolean {
  const t = text.trimStart();
  if (t.startsWith('<') && /<\w/.test(t)) return true;
  if (/^\[?(INST|SYS|SYSTEM|CONTEXT|RECAP)\b/i.test(t)) return true;
  return false;
}

function contentPreview(content: CapturedMessage['content']): string {
  if (typeof content === 'string') return content.trimStart();
  if (Array.isArray(content)) {
    const texts = (content as any[])
      .map((b: any) => (b?.text ?? b?.content ?? (typeof b === 'string' ? b : '')).trimStart())
      .filter(Boolean);
    const real = texts.filter((t) => !isInjected(t));
    return (real.length > 0 ? real : texts).join(' ');
  }
  const obj = content as any;
  return (obj?.text ?? obj?.content ?? obj?.name ?? JSON.stringify(content)).trimStart();
}

// Semantic direction: user/tool_use are calls (solid), assistant/tool_result are returns (dashed).
function isSemanticRequest(msg: CapturedMessage): boolean {
  return msg.message_type === 'user' || msg.message_type === 'tool_use';
}

// Extract a stable key from the system prompt — enough to distinguish agents,
// short enough to be cheap. Returns '' if no system prompt found.
function sysPromptKey(rawBody: any): string {
  const sys =
    rawBody?.system ??
    (rawBody?.messages as any[] | undefined)?.find((m: any) => m.role === 'system')?.content;
  if (!sys) return '';
  const text = typeof sys === 'string' ? sys : JSON.stringify(sys);
  return text.slice(0, 300);
}

function markerId(color: string) {
  return 'arr-' + color.replace('#', '');
}

export function SequenceView({ messages }: Props) {
  const th = useTheme();
  const selectedId = useMessageStore((s) => s.selectedId);
  const setSelected = useMessageStore((s) => s.setSelected);
  const setJsonView = useMessageStore((s) => s.setJsonView);

  const visible = messages.filter((m) => VISIBLE.has(m.message_type));

  // ── Agent identification ──────────────────────────────────────────────────
  // Request-direction messages always carry the full raw_body (including system prompt).
  // Response-direction messages share a request_id with their corresponding request message.
  const reqIdToSysKey = new Map<string, string>();
  for (const m of visible) {
    if (m.direction === 'request') {
      const key = sysPromptKey(m.raw_body as any);
      if (key) reqIdToSysKey.set(m.request_id, key);
    }
  }

  function getAgentSysKey(msg: CapturedMessage): string {
    return reqIdToSysKey.get(msg.request_id) ?? '';
  }

  // Ordered list of unique agent keys (in order of first appearance)
  const agentSysKeys: string[] = [];
  for (const m of visible) {
    const key = getAgentSysKey(m);
    if (!agentSysKeys.includes(key)) agentSysKeys.push(key);
  }

  const multiAgent = agentSysKeys.length > 1;
  function agentLabel(idx: number): string {
    return multiAgent ? `Agent ${idx + 1}` : 'Claude';
  }
  function agentColor(idx: number): string {
    return AGENT_COLORS[idx % AGENT_COLORS.length];
  }

  // Column index for a message's agent
  function agentColIdx(msg: CapturedMessage): number {
    const key = getAgentSysKey(msg);
    const idx = agentSysKeys.indexOf(key);
    return 1 + (idx >= 0 ? idx : 0);
  }

  // ── Tool identification ───────────────────────────────────────────────────
  const toolUseIdToName = new Map<string, string>();
  for (const m of visible) {
    if (m.message_type === 'tool_use') {
      const c = m.content as any;
      if (c?.id && c?.name) toolUseIdToName.set(c.id, c.name);
    }
  }

  const toolNames: string[] = [];
  for (const m of visible) {
    if (m.message_type === 'tool_use') {
      const name = (m.content as any)?.name;
      if (name && !toolNames.includes(name)) toolNames.push(name);
    }
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  const agentLabels = agentSysKeys.map((_, i) => agentLabel(i));
  const participants = ['User', ...agentLabels, ...toolNames];
  const toolBase = 1 + agentSysKeys.length; // first tool column index

  const totalW = Math.max(participants.length * COL_W, 600);
  const totalH = HEADER_H + visible.length * ROW_H + 40;

  function colX(idx: number) {
    return idx * COL_W + COL_W / 2;
  }

  function getFromTo(msg: CapturedMessage): [number, number] {
    const ac = agentColIdx(msg);
    switch (msg.message_type) {
      case 'user':
        return [0, ac];
      case 'assistant':
        return [ac, 0];
      case 'tool_use': {
        const name = (msg.content as any)?.name ?? '';
        const ti = toolNames.indexOf(name);
        return [ac, ti >= 0 ? toolBase + ti : ac];
      }
      case 'tool_result': {
        const name = msg.tool_use_id ? toolUseIdToName.get(msg.tool_use_id) : undefined;
        const ti = name ? toolNames.indexOf(name) : -1;
        return [ti >= 0 ? toolBase + ti : ac, ac];
      }
      default:
        return [0, ac];
    }
  }

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

  const markerColors = new Set<string>();
  for (const m of visible) markerColors.add(MESSAGE_COLORS[m.message_type]);

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', width: '100%', height: '100%', paddingTop: 12 }}>
      <svg
        width={totalW}
        height={totalH}
        style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}
      >
        <defs>
          {[...markerColors].map((color) => (
            <marker
              key={color}
              id={markerId(color)}
              markerWidth="8" markerHeight="6"
              refX="7" refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={color} />
            </marker>
          ))}
        </defs>

        {/* Participant header boxes + lifelines */}
        {participants.map((p, i) => {
          const cx = colX(i);
          const isToolCol = i >= toolBase;
          const isUserCol = i === 0;
          const agentIdx = i - 1; // valid when !isUserCol && !isToolCol
          const boxColor = isToolCol
            ? TOOL_COLOR
            : isUserCol
            ? USER_COLOR
            : agentColor(agentIdx);
          const fillColor = isToolCol
            ? '#1C1500'
            : isUserCol
            ? '#0D1117'
            : '#071A12';

          return (
            <g key={p}>
              <rect
                x={cx - BOX_W / 2} y={8}
                width={BOX_W} height={BOX_H}
                fill={fillColor} stroke={boxColor} strokeWidth={1.5} rx={6}
              />
              <text
                x={cx} y={8 + BOX_H / 2 + 5}
                textAnchor="middle" fill={boxColor}
                fontSize={12} fontWeight={600} fontFamily="system-ui, sans-serif"
              >
                {p}
              </text>
              <line
                x1={cx} y1={8 + BOX_H} x2={cx} y2={totalH - 20}
                stroke="#374151" strokeWidth={1} strokeDasharray="4 4"
              />
            </g>
          );
        })}

        {/* Message arrows */}
        {visible.map((msg, i) => {
          const y = HEADER_H + i * ROW_H + ROW_H / 2;
          const [fi, ti] = getFromTo(msg);
          const color = MESSAGE_COLORS[msg.message_type];
          const isSelected = msg.id === selectedId;
          const goesRight = ti > fi;
          const selfMsg = fi === ti;
          const isRequest = isSemanticRequest(msg);

          const fx = colX(fi);
          const tx = colX(ti);

          const label = msg.message_type === 'tool_use'
            ? `⚙ ${(msg.content as any)?.name ?? 'tool'}`
            : msg.message_type === 'tool_result'
            ? `↩ ${truncate(contentPreview(msg.content), 30)}`
            : truncate(contentPreview(msg.content), 40);

          const arrowX1 = selfMsg ? fx : (goesRight ? fx + 6 : fx - 6);
          const arrowX2 = selfMsg ? fx : (goesRight ? tx - 10 : tx + 10);
          const midX = selfMsg ? fx + 40 : (fx + tx) / 2;
          const marker = `url(#${markerId(color)})`;
          const dashArray = isRequest ? undefined : '6 3';

          return (
            <g
              key={msg.id}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(isSelected ? null : msg.id)}
              onDoubleClick={(e) => { e.stopPropagation(); setJsonView(msg.id); }}
            >
              {isSelected && (
                <rect
                  x={0} y={y - ROW_H / 2 + 4}
                  width={totalW} height={ROW_H - 8}
                  fill="#1E3A5F" opacity={0.35} rx={4}
                />
              )}
              <rect x={0} y={y - ROW_H / 2 + 4} width={totalW} height={ROW_H - 8} fill="transparent" />

              {selfMsg ? (
                <path
                  d={`M${fx} ${y - 8} Q${fx + 50} ${y - 8} ${fx + 50} ${y} Q${fx + 50} ${y + 8} ${fx} ${y + 8}`}
                  fill="none" stroke={color} strokeWidth={isSelected ? 2 : 1.5}
                  strokeDasharray={dashArray} markerEnd={marker} opacity={0.8}
                />
              ) : (
                <line
                  x1={arrowX1} y1={y} x2={arrowX2} y2={y}
                  stroke={color} strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeDasharray={dashArray} markerEnd={marker} opacity={0.85}
                />
              )}

              <text
                x={midX} y={y - 8}
                textAnchor="middle" fill={color} fontSize={11}
                fontFamily={
                  msg.message_type === 'tool_use' || msg.message_type === 'tool_result'
                    ? 'monospace' : 'system-ui, sans-serif'
                }
                opacity={isSelected ? 1 : 0.9}
              >
                {label}
              </text>

              {/* Agent label for multi-agent: show which agent on the arrow */}
              {multiAgent && (msg.message_type === 'tool_use' || msg.message_type === 'assistant') && (
                <text
                  x={midX} y={y + 16}
                  textAnchor="middle" fill={agentColor(agentSysKeys.indexOf(getAgentSysKey(msg)))}
                  fontSize={9} fontFamily="monospace" opacity={0.7}
                >
                  {agentLabel(agentSysKeys.indexOf(getAgentSysKey(msg)))}
                </text>
              )}

              {msg.message_type === 'assistant' && msg.output_tokens != null && (
                <text
                  x={midX} y={y + (multiAgent ? 26 : 18)}
                  textAnchor="middle" fill="#6B7280" fontSize={9} fontFamily="monospace"
                >
                  {msg.input_tokens != null ? `in:${msg.input_tokens} ` : ''}out:{msg.output_tokens}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
