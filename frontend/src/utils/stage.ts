import type { CapturedMessage } from '../types';

const ANIMATABLE = new Set(['user', 'assistant', 'tool_use', 'tool_result']);

export const AGENT_COLORS = [
  '#10B981',
  '#6366F1',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#A855F7',
  '#22D3EE',
];

export const USER_COLOR = '#3B82F6';
export const TOOL_COLOR = '#F59E0B';

export function sysPromptKey(rawBody: any): string {
  const sys =
    rawBody?.system ??
    (rawBody?.messages as any[] | undefined)?.find((m: any) => m.role === 'system')?.content;
  if (!sys) return '__default__';
  const text = typeof sys === 'string' ? sys : JSON.stringify(sys);
  return text.slice(0, 300);
}

export function workerOf(m: CapturedMessage): string {
  return sysPromptKey(m.raw_body);
}

export function getToolUseId(m: CapturedMessage): string | null {
  if (m.message_type !== 'tool_use') return null;
  const c = m.content as any;
  if (c?.id) return c.id;
  if (Array.isArray(c)) {
    for (const b of c as any[]) if (b?.id) return b.id;
  }
  return null;
}

export function getToolName(m: CapturedMessage): string | null {
  if (m.message_type !== 'tool_use') return null;
  const c = m.content as any;
  if (c?.name) return c.name;
  if (Array.isArray(c)) {
    for (const b of c as any[]) if (b?.name) return b.name;
  }
  return null;
}

export interface Worker {
  key: string;
  index: number;
  firstSeenAt: number;
  label: string;
  color: string;
  model: string;
}

export interface ToolNode {
  name: string;
  mcp: string | null;
  firstSeenAt: number;
}

export interface StageState {
  workers: Worker[];
  tools: ToolNode[];
  current: CapturedMessage | null;
}

export function deriveStageState(
  messages: CapturedMessage[],
  cursor: number
): StageState {
  const upTo = messages.slice(0, Math.min(cursor + 1, messages.length));
  const workersMap = new Map<string, Worker>();
  const toolsMap = new Map<string, ToolNode>();

  for (const m of upTo) {
    if (!ANIMATABLE.has(m.message_type)) continue;
    const wk = workerOf(m);
    if (!workersMap.has(wk)) {
      const idx = workersMap.size;
      workersMap.set(wk, {
        key: wk,
        index: idx,
        firstSeenAt: m.timestamp,
        label: idx === 0 ? 'main' : `worker ${idx + 1}`,
        color: AGENT_COLORS[idx % AGENT_COLORS.length],
        model: m.model,
      });
    }
    const tname = getToolName(m);
    if (tname && !toolsMap.has(tname)) {
      toolsMap.set(tname, { name: tname, mcp: m.mcp_server, firstSeenAt: m.timestamp });
    }
  }

  return {
    workers: Array.from(workersMap.values()),
    tools: Array.from(toolsMap.values()),
    current: messages[cursor] ?? null,
  };
}

export type Endpoint =
  | { kind: 'user' }
  | { kind: 'worker'; key: string }
  | { kind: 'tool'; name: string };

export interface ActiveEdge {
  from: Endpoint | null;
  to: Endpoint | null;
  m: CapturedMessage | null;
}

export function endpointsFor(messages: CapturedMessage[], cursor: number): ActiveEdge {
  const m = messages[cursor];
  if (!m) return { from: null, to: null, m: null };
  if (!ANIMATABLE.has(m.message_type)) return { from: null, to: null, m };
  const wk = workerOf(m);

  switch (m.message_type) {
    case 'user':
      return { from: { kind: 'user' }, to: { kind: 'worker', key: wk }, m };
    case 'assistant':
      return { from: { kind: 'worker', key: wk }, to: { kind: 'user' }, m };
    case 'tool_use': {
      const name = getToolName(m);
      return {
        from: { kind: 'worker', key: wk },
        to: name ? { kind: 'tool', name } : null,
        m,
      };
    }
    case 'tool_result': {
      const tuId = m.tool_use_id;
      let tu: CapturedMessage | undefined;
      if (tuId) {
        tu = messages.find(
          (x) => x.message_type === 'tool_use' && getToolUseId(x) === tuId
        );
      }
      const name = tu ? getToolName(tu) : null;
      const targetWk = tu ? workerOf(tu) : wk;
      return {
        from: name ? { kind: 'tool', name } : null,
        to: { kind: 'worker', key: targetWk },
        m,
      };
    }
  }
  return { from: null, to: null, m };
}
