import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "org_admin" | "device_manager" | "viewer";
  avatarUrl?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  currentOrg: Organization | null;
  organizations: Organization[];
  permissions: string[];
  setUser: (user: User, token: string) => void;
  setCurrentOrg: (org: Organization) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setPermissions: (permissions: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      currentOrg: null,
      organizations: [],
      permissions: [],
      setUser: (user, token) => {
        localStorage.setItem("auth_token", token);
        set({ user, token });
      },
      setCurrentOrg: (org) => set({ currentOrg: org }),
      setOrganizations: (organizations) => set({ organizations }),
      setPermissions: (permissions) => set({ permissions }),
      logout: () => {
        localStorage.removeItem("auth_token");
        set({ user: null, token: null, currentOrg: null, permissions: [] });
      },
    }),
    { name: "mdm-auth" },
  ),
);
