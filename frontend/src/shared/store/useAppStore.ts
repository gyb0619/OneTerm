import { create } from 'zustand';
import type { UserProfileResponse } from '../types/api';

interface AppState {
  currentUser: UserProfileResponse | null;
  highlightedEventId: number | null;
  setCurrentUser: (user: UserProfileResponse | null) => void;
  setHighlightedEventId: (eventId: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  highlightedEventId: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  setHighlightedEventId: (eventId) => set({ highlightedEventId: eventId }),
}));
