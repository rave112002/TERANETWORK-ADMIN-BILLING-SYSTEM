import { create } from "zustand";

export const useAnnouncementStore = create((set) => ({
  announcements: [],
  setAnnouncements: (announcements) => set({ announcements }),
}));
