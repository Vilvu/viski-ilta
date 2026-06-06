import { useState, useEffect } from 'react';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

// Azure Static Web Apps provides /.auth/me endpoint
interface SwaAuthResponse {
  clientPrincipal: {
    userId: string;
    userRoles: string[];
    claims: Array<{ typ: string; val: string }>;
    identityProvider: string;
    userDetails: string;
  } | null;
}

export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
  });

  useEffect(() => {
    async function fetchAuthState() {
      try {
        const response = await fetch('/.auth/me');
        const data: SwaAuthResponse = await response.json();

        if (data.clientPrincipal) {
          const { userId, userRoles, claims, userDetails } =
            data.clientPrincipal;
          const nameClaim = claims.find((c) => c.typ === 'name');
          const isAdmin = userRoles.includes('admin');

          setAuthState({
            user: {
              id: userId,
              email: userDetails,
              name: nameClaim?.val ?? userDetails,
              role: isAdmin ? 'admin' : 'user',
            },
            isLoading: false,
            isAuthenticated: true,
            isAdmin,
          });
        } else {
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
          });
        }
      } catch {
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
        });
      }
    }

    fetchAuthState();
  }, []);

  return authState;
}
