import { useAuthStore } from "@/stores/auth.store";

export function usePermission(permission: string): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  const role = useAuthStore((s) => s.user?.role);

  if (role === "super_admin") return true;
  return permissions.includes(permission);
}

export function useHasAnyPermission(perms: string[]): boolean {
  const permissions = useAuthStore((s) => s.permissions);
  const role = useAuthStore((s) => s.user?.role);

  if (role === "super_admin") return true;
  return perms.some((p) => permissions.includes(p));
}
