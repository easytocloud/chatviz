import { useRef, useState, useEffect } from 'react';
import type { CapturedMessage } from '../types';
import { useMessageStore } from '../store/messages';
import { useTheme } from '../styles/theme';
import { MESSAGE_COLORS } from '../styles/colors';
import { contentPreview } from '../utils/messageHelpers';

interface Props {
  messages: CapturedMessage[];
}

const VISIBLE = new Set(['user', 'assistant', 'tool_use', 'tool_result']);
const ROW_H = 68;
const COL_W = 96;
const BOX_W = 80;
const BOX_H = 26;
const BOX_PAD = 8;
const HDR_SVG_H = BOX_PAD + BOX_H + BOX_PAD; // 42
const CHIP_ROW_H = 22;
const EXIT_MS = 350;

const AGENT_COLORS = ['#10B981', '#6366F1', '#EC4899', '#14B8A6', '#F97316'];
const TOOL_COLOR = '#F59E0B';
const USER_COLOR = '#3B82F6';

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function isSemanticRequest(msg: CapturedMessage): boolean {
  return msg.message_type === 'user' || msg.message_type === 'tool_use';
}

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

interface ThreadGroup { startRow: number; rowCount: number; }

function groupThreads(visible: CapturedMessage[]): ThreadGroup[] {
  if (!visible.length) return [];
  const groups: ThreadGroup[] = [];
  let start = 0;
  for (let i = 1; i < visible.length; i++) {
    if (visible[i].message_type === 'user') { groups.push({ startRow: start, rowCount: i - start }); start = i; }
  }
  groups.push({ startRow: start, rowCount: visible.length - start });
  return groups;
}

interface WorkerGhost { sysKey: string; cx: number; origIdx: number; }

export function SequenceView({ messages }: Props) {
  const th = useTheme();
  const selectedId = useMessageStore((s) => s.selectedId);
  const setSelected = useMessageStore((s) => s.setSelected);
  const setJsonView = useMessageStore((s) => s.setJsonView);
  const workerSysKey = useMessageStore((s) => s.filters.workerSysKey);
  const setWorkerSysKey = useMessageStore((s) => s.setWorkerSysKey);
  const allMessages = useMessageStore((s) => s.messages);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerW, setContainerW] = useState(800);
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState(false);

  // Worker column slide animations
  const [ghosts, setGhosts] = useState<WorkerGhost[]>([]);   // exiting workers
  const [entering, setEntering] = useState<Set<string>>(new Set()); // entering workers
  const workerXRef = useRef<Map<string, number>>(new Map());  // last known cx per sysKey
  const prevActiveKeysRef = useRef<string[]>([]);

  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(e => setContainerW(e[0].contentRect.width));
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!toolsDrawerOpen) return;
    function onDown(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setToolsDrawerOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [toolsDrawerOpen]);

  // ── Worker dependency filtering ────────────────────────────────────────────
  // When a worker is selected, only show messages in its dependency chain
  let filteredVisible = messages.filter((m) => VISIBLE.has(m.message_type));

  if (workerSysKey) {
    // Build request_id -> sysKey mapping for all messages
    const reqIdToSysKeyMap = new Map<string, string>();
    for (const m of messages) {
      if (m.direction === 'request') {
        const key = sysPromptKey(m.raw_body as any);
        if (key) reqIdToSysKeyMap.set(m.request_id, key);
      }
    }

    // Find all request_ids that involve the selected worker (as sender or receiver)
    const workerRequestIds = new Set<string>();
    for (const [reqId, sysKey] of reqIdToSysKeyMap.entries()) {
      if (sysKey === workerSysKey) {
        workerRequestIds.add(reqId);
      }
    }

    // For worker filtering: show messages from the worker AND related messages
    // A message is shown if:
    // 1. It's from the worker (assistant/tool_use with matching sysKey)
    // 2. It's a tool_result for a tool_use from this worker
    // 3. It's a user message in the same request chain
    filteredVisible = messages.filter((m) => {
      if (!VISIBLE.has(m.message_type)) return false;

      const sysKey = reqIdToSysKeyMap.get(m.request_id) ?? '';

      // User messages in the worker's request chain
      if (m.message_type === 'user') {
        return workerRequestIds.has(m.request_id);
      }

      // Assistant messages from the worker
      if (m.message_type === 'assistant' && sysKey === workerSysKey) {
        return true;
      }

      // Tool uses from the worker
      if (m.message_type === 'tool_use' && sysKey === workerSysKey) {
        return true;
      }

      // Tool results for the worker's tool uses
      if (m.message_type === 'tool_result') {
        // Check if this tool result corresponds to a tool_use from our worker
        const toolUseId = (m.content as any)?.tool_use_id;
        if (toolUseId) {
          // Find the corresponding tool_use message
          for (const otherMsg of messages) {
            if (otherMsg.message_type === 'tool_use') {
              const otherSysKey = reqIdToSysKeyMap.get(otherMsg.request_id) ?? '';
              const otherToolId = (otherMsg.content as any)?.id;
              if (otherToolId === toolUseId && otherSysKey === workerSysKey) {
                return true;
              }
            }
          }
        }
      }

      return false;
    });
  }

  const visible = filteredVisible;

  // ── Agent identification ───────────────────────────────────────────────────
  // Build sysKey map from filtered messages for body rendering
  const reqIdToSysKey = new Map<string, string>();
  for (const m of visible) {
    if (m.direction === 'request') {
      const key = sysPromptKey(m.raw_body as any);
      if (key) reqIdToSysKey.set(m.request_id, key);
    }
  }
  function getAgentSysKey(msg: CapturedMessage): string { return reqIdToSysKey.get(msg.request_id) ?? ''; }

  // For worker columns in header, always use all messages (unfiltered) so all workers stay visible
  const allAgentSysKeys: string[] = [];
  const allReqIdToSysKey = new Map<string, string>();
  for (const m of allMessages) {
    if (m.direction === 'request') {
      const key = sysPromptKey(m.raw_body as any);
      if (key && !allReqIdToSysKey.has(m.request_id)) {
        allReqIdToSysKey.set(m.request_id, key);
        if (!allAgentSysKeys.includes(key)) allAgentSysKeys.push(key);
      }
    }
  }

  const multiAgent = allAgentSysKeys.length > 1;
  function agentLabel(origIdx: number): string { return multiAgent ? `Worker ${origIdx + 1}` : 'Claude'; }
  function agentColor(origIdx: number): string { return AGENT_COLORS[origIdx % AGENT_COLORS.length]; }

  // ── Tool identification ────────────────────────────────────────────────────
  const toolUseIdToName = new Map<string, string>();
  for (const m of visible) {
    if (m.message_type === 'tool_use') {
      const c = m.content as any;
      if (c?.id && c?.name) toolUseIdToName.set(c.id, c.name);
    }
  }
  const allToolNames: string[] = [];
  for (const m of visible) {
    if (m.message_type === 'tool_use') {
      const name = (m.content as any)?.name;
      if (name && !allToolNames.includes(name)) allToolNames.push(name);
    }
  }

  // ── Thread grouping ────────────────────────────────────────────────────────
  const threads = groupThreads(visible);
  const scrolledThreads = threads.filter(t => (t.startRow + t.rowCount) * ROW_H < scrollTop);

  // ── Active workers (scroll-aware; tools always shown) ────────────────────
  const nonScrolledMsgs: CapturedMessage[] = [];
  for (const t of threads) {
    if ((t.startRow + t.rowCount) * ROW_H >= scrollTop) {
      for (const msg of visible.slice(t.startRow, t.startRow + t.rowCount)) nonScrolledMsgs.push(msg);
    }
  }
  const activeAgentSysKeySet = new Set(nonScrolledMsgs.map(getAgentSysKey).filter(Boolean));

  // For worker filtering mode, only show the selected worker in the header
  // Otherwise, only show workers with messages in the non-scrolled area
  const activeAgentSysKeys = workerSysKey
    ? allAgentSysKeys.filter(k => k === workerSysKey)
    : allAgentSysKeys.filter(k => activeAgentSysKeySet.has(k));

  // ── Tool roll-up ──────────────────────────────────────────────────────────
  // For worker filtering mode, only show tools that the worker uses
  const workerTools = workerSysKey
    ? allToolNames.filter(name => {
        return visible.some(m => {
          if (m.message_type === 'tool_use') {
            return (m.content as any)?.name === name;
          }
          if (m.message_type === 'tool_result') {
            return (m.content as any)?.tool_use_id && toolUseIdToName.get((m.content as any).tool_use_id) === name;
          }
          return false;
        });
      })
    : allToolNames;

  const fixedCols = 1 + activeAgentSysKeys.length;
  const spaceForTools = containerW - fixedCols * COL_W;
  const toolsExpanded = workerTools.length === 0 || workerTools.length * COL_W <= spaceForTools;

  // ── Participants & layout ─────────────────────────────────────────────────
  const activeWorkerLabels = activeAgentSysKeys.map(k => agentLabel(allAgentSysKeys.indexOf(k)));
  const activeParticipants = toolsExpanded
    ? ['User', ...activeWorkerLabels, ...workerTools]
    : ['User', ...activeWorkerLabels, 'Tools'];
  const activeToolBase = 1 + activeAgentSysKeys.length;
  const totalW = Math.max(activeParticipants.length * COL_W, 400);

  function colX(idx: number) { return idx * COL_W + COL_W / 2; }

  function activeAgentColIdx(msg: CapturedMessage): number {
    const key = getAgentSysKey(msg);
    const idx = activeAgentSysKeys.indexOf(key);
    return 1 + (idx >= 0 ? idx : 0);
  }

  function getFromTo(msg: CapturedMessage): [number, number] {
    const ac = activeAgentColIdx(msg);
    switch (msg.message_type) {
      case 'user': return [0, ac];
      case 'assistant': return [ac, 0];
      case 'tool_use': {
        if (!toolsExpanded) return [ac, activeToolBase];
        const name = (msg.content as any)?.name ?? '';
        const ti = allToolNames.indexOf(name);
        return [ac, ti >= 0 ? activeToolBase + ti : ac];
      }
      case 'tool_result': {
        if (!toolsExpanded) return [activeToolBase, ac];
        const name = msg.tool_use_id ? toolUseIdToName.get(msg.tool_use_id) : undefined;
        const ti = name ? allToolNames.indexOf(name) : -1;
        return [ti >= 0 ? activeToolBase + ti : ac, ac];
      }
      default: return [0, ac];
    }
  }

  // ── Worker slide animations ────────────────────────────────────────────────
  // Record current x positions of active workers before the effect runs
  for (let i = 0; i < activeAgentSysKeys.length; i++) {
    workerXRef.current.set(activeAgentSysKeys[i], colX(i + 1));
  }

  const activeKeysStr = activeAgentSysKeys.join('|');
  useEffect(() => {
    const prev = prevActiveKeysRef.current;
    const curr = activeAgentSysKeys;
    const newExiting = prev.filter(k => !curr.includes(k));
    const newEntering = curr.filter(k => !prev.includes(k));
    prevActiveKeysRef.current = curr;

    if (!newExiting.length && !newEntering.length) return;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (newExiting.length) {
      const newGhosts = newExiting.map(k => ({
        sysKey: k,
        cx: workerXRef.current.get(k) ?? colX(1),
        origIdx: allAgentSysKeys.indexOf(k),
      }));
      setGhosts(prev => [...prev, ...newGhosts]);
      timers.push(setTimeout(() =>
        setGhosts(prev => prev.filter(g => !newExiting.includes(g.sysKey))),
        EXIT_MS + 20
      ));
    }

    if (newEntering.length) {
      setEntering(prev => new Set([...prev, ...newEntering]));
      timers.push(setTimeout(() =>
        setEntering(prev => { const n = new Set(prev); newEntering.forEach(k => n.delete(k)); return n; }),
        EXIT_MS + 20
      ));
    }

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKeysStr]);

  function handleBodyScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = el.scrollLeft;
  }

  if (visible.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: th.textDimmer, fontSize: 14, flexDirection: 'column', gap: 8 }}>
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

  const CSS_ANIM = `
    @keyframes wkExit{0%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(-20px)}}
    @keyframes wkEnter{0%{opacity:0;transform:translateX(20px)}100%{opacity:1;transform:translateX(0)}}
    .wk-exit{animation:wkExit ${EXIT_MS}ms ease-out forwards}
    .wk-enter{animation:wkEnter ${EXIT_MS}ms ease-out forwards}
  `;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Fixed header ──────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, background: th.bgBase, zIndex: 10, position: 'relative' }}>

        {/* Thread chips */}
        {scrolledThreads.length > 0 && (
          <div style={{ height: CHIP_ROW_H, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', background: th.bgPanel, borderBottom: `1px solid ${th.border}`, overflowX: 'auto' }}>
            {scrolledThreads.map((t, ti) => {
              const firstNonUser = visible.slice(t.startRow, t.startRow + t.rowCount).find(m => m.message_type !== 'user');
              const origIdx = firstNonUser ? allAgentSysKeys.indexOf(getAgentSysKey(firstNonUser)) : 0;
              const color = origIdx >= 0 ? agentColor(origIdx) : AGENT_COLORS[0];
              return (
                <div key={ti} onClick={() => { if (bodyRef.current) bodyRef.current.scrollTop = t.startRow * ROW_H; }} title={`Jump to thread ${ti + 1}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 10, fontSize: 9, fontWeight: 600, background: color + '22', color: th.textBright, border: `1px solid ${color}44`, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'monospace', flexShrink: 0 }}>
                  #{ti + 1} · {t.rowCount}
                </div>
              );
            })}
          </div>
        )}

        {/* Participant boxes (h-scroll synced with body) */}
        <div ref={headerScrollRef} style={{ overflowX: 'hidden', overflowY: 'visible' }}>
          <svg width={totalW} height={HDR_SVG_H} style={{ display: 'block' }}>
            <defs>
              <style>{CSS_ANIM}</style>
            </defs>

            {/* Active participant boxes */}
            {activeParticipants.map((p, i) => {
              const cx = colX(i);
              const isToolCol = i >= activeToolBase;
              const isUserCol = i === 0;
              const isSentinel = p === 'Tools';
              const activeAgentIdx = i - 1;
              const origAgentIdx = isToolCol || isUserCol ? -1 : allAgentSysKeys.indexOf(activeAgentSysKeys[activeAgentIdx]);
              const boxColor = isToolCol ? TOOL_COLOR : isUserCol ? USER_COLOR : agentColor(origAgentIdx);
              const fillColor = isToolCol ? '#1C1500' : isUserCol ? '#0D1117' : '#071A12';
              const label = isSentinel ? `Tools ${toolsDrawerOpen ? '▴' : '▾'}` : p;
              const isWorker = !isToolCol && !isUserCol;
              const workerKey = isWorker ? activeAgentSysKeys[activeAgentIdx] : null;
              const isEntering = workerKey ? entering.has(workerKey) : false;
              return (
                <g key={p} className={isEntering ? 'wk-enter' : undefined}
                  style={{ cursor: workerKey ? 'pointer' : (isSentinel ? 'pointer' : undefined) }}
                  onClick={() => {
                    if (workerKey) {
                      // Clicked a worker - toggle filtering
                      setWorkerSysKey(workerSysKey === workerKey ? null : workerKey);
                    } else if (isSentinel) {
                      setToolsDrawerOpen(o => !o);
                    }
                  }}>
                  <rect x={cx - BOX_W / 2} y={BOX_PAD} width={BOX_W} height={BOX_H} fill={fillColor} stroke={workerKey && workerSysKey === workerKey ? th.textBright : boxColor} strokeWidth={workerKey && workerSysKey === workerKey ? 2.5 : 1.5} rx={4} />
                  <text x={cx} y={BOX_PAD + BOX_H / 2 + 4} textAnchor="middle" fill={workerKey && workerSysKey === workerKey ? th.textBright : th.textBright} fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">{label}</text>
                  <line x1={cx} y1={BOX_PAD + BOX_H} x2={cx} y2={HDR_SVG_H} stroke="#374151" strokeWidth={1} strokeDasharray="4 4" />
                </g>
              );
            })}

            {/* Ghost boxes for exiting workers (slide-out animation) */}
            {ghosts.map(g => {
              const color = agentColor(g.origIdx);
              return (
                <g key={`ghost-${g.sysKey}`} className="wk-exit">
                  <rect x={g.cx - BOX_W / 2} y={BOX_PAD} width={BOX_W} height={BOX_H} fill="#071A12" stroke={color} strokeWidth={1.5} rx={4} />
                  <text x={g.cx} y={BOX_PAD + BOX_H / 2 + 4} textAnchor="middle" fill={th.textBright} fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">{agentLabel(g.origIdx)}</text>
                  <line x1={g.cx} y1={BOX_PAD + BOX_H} x2={g.cx} y2={HDR_SVG_H} stroke="#374151" strokeWidth={1} strokeDasharray="4 4" />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Tools drawer (rolled-up mode) */}
        {!toolsExpanded && toolsDrawerOpen && (
          <div ref={drawerRef} style={{ position: 'absolute', top: HDR_SVG_H + (scrolledThreads.length > 0 ? CHIP_ROW_H : 0), left: Math.max(0, colX(activeToolBase) - (headerScrollRef.current?.scrollLeft ?? 0) - 70), zIndex: 50, background: th.bgPanel, border: `1px solid ${TOOL_COLOR}55`, borderRadius: 6, padding: '4px 0', minWidth: 150, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
            {allToolNames.map(name => (
              <div key={name} style={{ padding: '3px 12px', fontSize: 10, color: TOOL_COLOR, fontFamily: 'monospace' }}>⚙ {name}</div>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────── */}
      <div ref={bodyRef} onScroll={handleBodyScroll} style={{ flex: 1, overflow: 'auto' }}>
        <svg width={totalW} height={visible.length * ROW_H + 40} style={{ display: 'block', fontFamily: 'system-ui, sans-serif' }}>
          <defs>
            {[...markerColors].map((color) => (
              <marker key={color} id={markerId(color)} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={color} />
              </marker>
            ))}
          </defs>

          {/* Lifelines */}
          {activeParticipants.map((p, i) => (
            <line key={p} x1={colX(i)} y1={0} x2={colX(i)} y2={visible.length * ROW_H + 20} stroke="#374151" strokeWidth={1} strokeDasharray="4 4" />
          ))}

          {/* Message arrows */}
          {visible.map((msg, i) => {
            const y = i * ROW_H + ROW_H / 2;
            const [fi, ti] = getFromTo(msg);
            const color = MESSAGE_COLORS[msg.message_type];
            const isSelected = msg.id === selectedId;
            const goesRight = ti > fi;
            const selfMsg = fi === ti;
            const isRequest = isSemanticRequest(msg);
            const fx = colX(fi), tx = colX(ti);
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
            const origAgentIdx = allAgentSysKeys.indexOf(getAgentSysKey(msg));

            return (
              <g key={msg.id} style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (clickTimer.current) clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(() => setSelected(isSelected ? null : msg.id), 250);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
                  setJsonView(msg.id);
                }}>
                {isSelected && <rect x={0} y={y - ROW_H / 2 + 4} width={totalW} height={ROW_H - 8} fill="#1E3A5F" opacity={0.35} rx={4} />}
                <rect x={0} y={y - ROW_H / 2 + 4} width={totalW} height={ROW_H - 8} fill="transparent" />

                {selfMsg ? (
                  <path d={`M${fx} ${y - 8} Q${fx + 50} ${y - 8} ${fx + 50} ${y} Q${fx + 50} ${y + 8} ${fx} ${y + 8}`} fill="none" stroke={color} strokeWidth={isSelected ? 2 : 1.5} strokeDasharray={dashArray} markerEnd={marker} opacity={0.8} />
                ) : (
                  <line x1={arrowX1} y1={y} x2={arrowX2} y2={y} stroke={color} strokeWidth={isSelected ? 2.5 : 1.5} strokeDasharray={dashArray} markerEnd={marker} opacity={0.85} />
                )}

                <text x={midX} y={y - 8} textAnchor="middle" fill={th.textPrimary} fontSize={11} fontFamily={msg.message_type === 'tool_use' || msg.message_type === 'tool_result' ? 'monospace' : 'system-ui, sans-serif'} opacity={isSelected ? 1 : 0.9}>{label}</text>

                {multiAgent && (msg.message_type === 'tool_use' || msg.message_type === 'assistant') && (
                  <text x={midX} y={y + 16} textAnchor="middle" fill={th.textSecondary} fontSize={9} fontFamily="monospace" opacity={0.8}>{agentLabel(origAgentIdx)}</text>
                )}

                {msg.message_type === 'assistant' && msg.output_tokens != null && (
                  <text x={midX} y={y + (multiAgent ? 26 : 18)} textAnchor="middle" fill={th.textMuted} fontSize={9} fontFamily="monospace">
                    {msg.input_tokens != null ? `in:${msg.input_tokens} ` : ''}out:{msg.output_tokens}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
