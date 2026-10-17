import { useSyncExternalStore } from 'react';
import type { AuthResponse, Me } from '@upvine/shared';

/**
 * Oturum durumu. Access token sadece bellekte tutulur (XSS ile çalınabilecek localStorage yok);
 * sayfa yenilenince httpOnly refresh çereziyle yeniden alınır.
 *
 * Admin "kullanıcının gözünden görüntüleme" sırasında access token hedef kullanıcınındır ve
 * `impersonating` doludur. Refresh çerezi admininki olarak kaldığı için çıkış = `refreshSession()`
 * (sayfa yenilenince ya da görüntüleme token'ı dolunca da otomatik olarak admin oturumuna dönülür).
 */
interface AuthState {
  accessToken: string | null;
  user: Me | null;
  impersonating: { id: string; name: string; email: string } | null;
}

let state: AuthState = { accessToken: null, user: null, impersonating: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export const authStore = {
  get: (): AuthState => state,
  setSession(res: AuthResponse): void {
    state = { accessToken: res.accessToken, user: res.user, impersonating: null };
    emit();
  },
  startImpersonation(accessToken: string, user: Me): void {
    state = { accessToken, user, impersonating: { id: user.id, name: user.name, email: user.email } };
    emit();
  },
  setUser(user: Me): void {
    state = { ...state, user };
    emit();
  },
  clear(): void {
    state = { accessToken: null, user: null, impersonating: null };
    emit();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const serverSnapshot: AuthState = { accessToken: null, user: null, impersonating: null };

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.get, () => serverSnapshot);
}

/** Panel içinde kullanılır; layout oturumu garanti ettiği için kullanıcı her zaman doludur. */
export function useCurrentUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser: oturum yok (sadece /app altında kullanın)');
  return user;
}
