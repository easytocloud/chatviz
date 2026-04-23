import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSSE } from './api/sse';
import { FilterBar } from './components/FilterBar';
import { ChatView } from './components/ChatView';
import { MessageCard } from './components/MessageCard';
import { useMessageStore, useFilteredMessages } from './store/messages';
import { ThemeContext, darkTheme, lightTheme } from './styles/theme';

export default function App() {
  useSSE();

  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? darkTheme : lightTheme;

  const selectedId = useMessageStore((s) => s.selectedId);
  const setSelected = useMessageStore((s) => s.setSelected);
  const messages = useMessageStore(useShallow((s) => s.messages));

  const filtered = useFilteredMessages();
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  return (
    <ThemeContext.Provider value={theme}>
      <div style={{
        display: 'flex', flexDirection: 'column', height: '100vh',
        background: theme.bgBase, color: theme.textPrimary, fontFamily: 'system-ui, sans-serif',
      }}>
        <header style={{
          padding: '10px 16px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          background: theme.bgPanel,
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em', color: theme.textBright }}>
            chatviz
          </span>
          <span style={{ color: theme.textGhost, fontSize: 12 }}>
            {messages.length} message{messages.length !== 1 ? 's' : ''} captured
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setIsDark(!isDark)}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              style={{
                background: 'none', border: `1px solid ${theme.border}`,
                borderRadius: 6, cursor: 'pointer', padding: '3px 10px',
                fontSize: 12, color: theme.textDim,
              }}
            >
              {isDark ? '☀ Light' : '☾ Dark'}
            </button>
          </div>
        </header>

        <FilterBar />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <ChatView messages={filtered} />
          </div>

          {selected && (
            <div style={{
              width: 580, flexShrink: 0, overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              borderLeft: `1px solid ${theme.border}`, background: theme.bgPanel,
            }}>
              <MessageCard message={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      </div>
    </ThemeContext.Provider>
  );
}
