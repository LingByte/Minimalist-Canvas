import { create } from "zustand";

type UserStore = {
    user: { id: string } | null;
};

export const useUserStore = create<UserStore>(() => ({
    user: null,
}));
