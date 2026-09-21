import { create } from 'zustand'

type LoginRequiredState = {
  open: boolean
  reason: 'required' | 'expired'
  requestLogin: (reason?: 'required' | 'expired') => void
  closeLogin: () => void
}

export const useLoginRequiredStore = create<LoginRequiredState>((set) => ({
  open: false,
  reason: 'required',
  requestLogin: (reason = 'required') => set({ open: true, reason }),
  closeLogin: () => set({ open: false }),
}))

export function requestLogin(reason: 'required' | 'expired' = 'required') {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/sign-in') return
  useLoginRequiredStore.getState().requestLogin(reason)
}
