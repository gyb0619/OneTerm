import { create } from 'zustand';
import { httpClient } from '../api/httpClient';
import type { UserProfileResponse } from '../types/api';

interface AppState {
  currentUser: UserProfileResponse | null;
  highlightedEventId: number | null;
  isRefreshingQuota: boolean;
  setCurrentUser: (user: UserProfileResponse | null) => void;
  setHighlightedEventId: (eventId: number | null) => void;
  refreshCurrentUser: () => Promise<UserProfileResponse | null>;
}

export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  highlightedEventId: null,
  isRefreshingQuota: false,
  setCurrentUser: (user) => set({ currentUser: user }),
  setHighlightedEventId: (eventId) => set({ highlightedEventId: eventId }),
  refreshCurrentUser: async () => {
    try {
      set({ isRefreshingQuota: true });
      const user = await httpClient.get<UserProfileResponse>('/api/auth/me');
      set({ currentUser: user });
      return user;
    } catch {
      return null;
    } finally {
      set({ isRefreshingQuota: false });
    }
  },
}));
