import { useShallow } from 'zustand/react/shallow';
import type { APIFamily, MessageType } from '../types';
import { useMessageStore } from '../store/messages';
import { MESSAGE_COLORS, FAMILY_COLORS } from '../styles/colors';
import { useTheme } from '../styles/theme';

const ALL_TYPES: MessageType[] = ['system', 'user', 'assistant', 'tool_use', 'tool_result'];
const ALL_FAMILIES: APIFamily[] = ['anthropic', 'openai', 'ollama'];

export function FilterBar() {
  const t = useTheme();
  const filters = useMessageStore((s) => s.filters);
  const setFilter = useMessageStore((s) => s.setFilter);
  const messages = useMessageStore(useShallow((s) => s.messages));
  const clearMessages = useMessageStore((s) => s.clearMessages);

  const toggle = <V extends string>(arr: V[], val: V): V[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleClear = () => {
    fetch('/chatviz/clear', { method: 'DELETE' }).catch(() => {});
    clearMessages();
  };

  const models = [...new Set(messages.map((m) => m.model))];

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      padding: '10px 16px', borderBottom: `1px solid ${t.border}`,
      background: t.bgSurface,
    }}>
      <span style={{ color: t.textDim, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Type:
      </span>
      {ALL_TYPES.map((type) => {
        const active = filters.types.length === 0 || filters.types.includes(type);
        return (
          <button
            key={type}
            onClick={() => setFilter({ types: toggle(filters.types, type) })}
            style={{
              padding: '2px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12,
              background: active ? MESSAGE_COLORS[type] : t.border,
              color: active ? '#fff' : t.textDim,
              opacity: active ? 1 : 0.6,
            }}
          >
            {type.replace('_', ' ')}
          </button>
        );
      })}

      <span style={{ color: t.textDim, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 8 }}>
        API:
      </span>
      {ALL_FAMILIES.map((f) => {
        const active = filters.families.length === 0 || filters.families.includes(f);
        return (
          <button
            key={f}
            onClick={() => setFilter({ families: toggle(filters.families, f) })}
            style={{
              padding: '2px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12,
              background: active ? FAMILY_COLORS[f] : t.border,
              color: active ? '#fff' : t.textDim,
            }}
          >
            {f}
          </button>
        );
      })}

      {models.length > 0 && (
        <>
          <span style={{ color: t.textDim, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: 8 }}>
            Model:
          </span>
          {models.map((m) => {
            const active = filters.models.length === 0 || filters.models.includes(m);
            return (
              <button
                key={m}
                onClick={() => setFilter({ models: toggle(filters.models, m) })}
                style={{
                  padding: '2px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: active ? t.borderMid : t.border,
                  color: active ? t.textPrimary : t.textDim,
                  fontFamily: 'monospace',
                }}
              >
                {m}
              </button>
            );
          })}
        </>
      )}

      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={handleClear}
          style={{
            padding: '2px 12px', borderRadius: 6, border: `1px solid ${t.borderMid}`,
            background: 'transparent', color: '#EF4444', cursor: 'pointer', fontSize: 12,
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
