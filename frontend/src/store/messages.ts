import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CapturedMessage, APIFamily, MessageType } from '../types';

interface Filters {
  types: MessageType[];
  families: APIFamily[];
  models: string[];
}

interface MessageStore {
  messages: CapturedMessage[];
  selectedId: string | null;
  jsonViewId: string | null;
  filters: Filters;
  addMessage: (m: CapturedMessage) => void;
  setMessages: (msgs: CapturedMessage[]) => void;
  setSelected: (id: string | null) => void;
  setJsonView: (id: string | null) => void;
  setFilter: (f: Partial<Filters>) => void;
  clearMessages: () => void;
}

export const useMessageStore = create<MessageStore>((set) => ({
  messages: [],
  selectedId: null,
  jsonViewId: null,
  filters: { types: [], families: [], models: [] },

  addMessage: (m) =>
    set((state) => ({
      messages: state.messages.some((x) => x.id === m.id)
        ? state.messages
        : [...state.messages, m],
    })),

  setMessages: (msgs) => set({ messages: msgs }),

  setSelected: (id) => set({ selectedId: id }),

  setJsonView: (id) => set({ jsonViewId: id }),

  setFilter: (f) =>
    set((state) => ({ filters: { ...state.filters, ...f } })),

  clearMessages: () => set({ messages: [], selectedId: null }),
}));

export function useFilteredMessages() {
  return useMessageStore(
    useShallow((state) => {
      const { messages, filters } = state;
      return messages.filter((m) => {
        if (filters.types.length && !filters.types.includes(m.message_type)) return false;
        if (filters.families.length && !filters.families.includes(m.api_family)) return false;
        if (filters.models.length && !filters.models.includes(m.model)) return false;
        return true;
      });
    })
  );
}
