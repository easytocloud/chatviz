import { useEffect } from 'react';
import type { CapturedMessage } from '../types';
import { useMessageStore } from '../store/messages';

export function useSSE() {
  const addMessage = useMessageStore((s) => s.addMessage);
  const setMessages = useMessageStore((s) => s.setMessages);

  useEffect(() => {
    // fetch history first
    fetch('/chatviz/messages')
      .then((r) => r.json())
      .then((msgs: CapturedMessage[]) => setMessages(msgs))
      .catch(() => {});

    const es = new EventSource('/chatviz/events');

    es.addEventListener('message', (e) => {
      try {
        const msg: CapturedMessage = JSON.parse(e.data);
        addMessage(msg);
      } catch {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => es.close();
  }, []);
}
