import { create } from 'zustand';

export type Speed = 1 | 2 | 4;

interface TimelineState {
  cursor: number;
  autoFollow: boolean;
  playing: boolean;
  speed: Speed;
  setCursor: (n: number) => void;
  setAutoFollow: (b: boolean) => void;
  setPlaying: (b: boolean) => void;
  togglePlaying: () => void;
  cycleSpeed: () => void;
  step: (delta: number) => void;
  scrubTo: (n: number) => void;
}

export const useTimeline = create<TimelineState>((set) => ({
  cursor: 0,
  autoFollow: true,
  playing: false,
  speed: 1,

  setCursor: (n) => set({ cursor: Math.max(0, n) }),

  setAutoFollow: (b) => set({ autoFollow: b }),

  setPlaying: (b) => set({ playing: b }),

  togglePlaying: () => set((s) => ({ playing: !s.playing })),

  cycleSpeed: () =>
    set((s) => ({ speed: s.speed === 1 ? 2 : s.speed === 2 ? 4 : 1 })),

  step: (delta) =>
    set((s) => ({
      cursor: Math.max(0, s.cursor + delta),
      autoFollow: false,
      playing: false,
    })),

  scrubTo: (n) =>
    set({ cursor: Math.max(0, n), autoFollow: false, playing: false }),
}));
