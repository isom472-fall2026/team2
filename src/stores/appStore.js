import { create } from 'zustand'

export const useAppStore = create((set) => ({
  session: null,
  profile: null,
  authType: 'ku',
  visaNationality: '',
  visaPassportMatches: '',
  visaDestination: '',
  theme: localStorage.getItem('team2-theme') || 'dark',
  maintenanceMode: null,
  maintenanceStatusError: '',
  testingMode: null,
  authVerificationPending: false,
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setAuthVerificationPending: (authVerificationPending) => set({ authVerificationPending }),
  setAuthType: (authType) => set({ authType }),
  setVisaNationality: (visaNationality) => set({
    visaNationality,
    visaPassportMatches: '',
    visaDestination: '',
  }),
  setVisaPassportMatches: (visaPassportMatches) => set({
    visaPassportMatches,
    visaDestination: '',
  }),
  setVisaDestination: (visaDestination) => set({ visaDestination }),
  setTheme: (theme) => set((state) => ({
    theme: typeof theme === 'function' ? theme(state.theme) : theme,
  })),
  setMaintenanceMode: (maintenanceMode) => set({ maintenanceMode }),
  setMaintenanceStatusError: (maintenanceStatusError) => set({ maintenanceStatusError }),
  setTestingMode: (testingMode) => set({ testingMode }),
}))
