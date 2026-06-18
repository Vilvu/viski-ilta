import { useState, useEffect } from 'react';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isTaster: boolean;
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

let authCachePromise: Promise<SwaAuthResponse> | null = null;
let isFetching = false;

function fetchAuthMe(force = false): Promise<SwaAuthResponse> {
  if (!authCachePromise || (force && !isFetching)) {
    isFetching = true;
    authCachePromise = fetch('/.auth/me')
      .then((res) => {
        isFetching = false;
        if (!res.ok) {
          authCachePromise = null;
          throw new Error('Network response was not ok');
        }
        return res.json();
      })
      .catch((err) => {
        isFetching = false;
        authCachePromise = null;
        throw err;
      });
  }
  return authCachePromise;
}

export function useAuth(): AuthState {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    isTaster: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchAuthState(retries = 3, delayMs = 100) {
      try {
        const isRetry = retries < 3;
        const data = await fetchAuthMe(isRetry);

        if (cancelled) return;

        if (data.clientPrincipal) {
          const { userId, userRoles, claims, userDetails } =
            data.clientPrincipal;
          const nameClaim =
            claims?.find((c) => c.typ === 'name') ??
            claims?.find((c) => c.typ === 'preferred_username') ??
            claims?.find((c) => c.typ === 'upn');
          const isAdmin = userRoles.includes('admin');
          const isTaster = userRoles.includes('taster') || isAdmin;
          const role = isAdmin ? 'admin' : isTaster ? 'taster' : 'user';

          // Detect Azure SWA masked userDetails (e.g. "vil*****") —
          // a few real characters followed by a run of asterisks.
          // Uses a specific pattern to avoid false positives on Entra ID
          // UPNs/display names that may legitimately contain a single '*'.
          const isDetailsMasked =
            typeof userDetails === 'string' &&
            /^.{1,5}\*{2,}$/.test(userDetails);

          if (isDetailsMasked && retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (!cancelled) return fetchAuthState(retries - 1, delayMs * 2);
            return;
          }

          if (isDetailsMasked) {
            // Retries exhausted but data is still masked — treat as failure
            // rather than rendering a corrupted username like "vil*****".
            console.warn(
              'useAuth: /.auth/me still returned masked userDetails after all retries. ' +
                'Azure SWA may have changed its response format.',
            );
            if (!cancelled) {
              setAuthState({
                user: null,
                isLoading: false,
                isAuthenticated: false,
                isAdmin: false,
                isTaster: false,
              });
            }
            return;
          }

          if (!cancelled) {
            setAuthState({
              user: {
                id: userId,
                email: userDetails,
                name: nameClaim?.val ?? userDetails,
                role,
              },
              isLoading: false,
              isAuthenticated: true,
              isAdmin,
              isTaster,
            });
          }
        } else {
          if (!cancelled) {
            setAuthState({
              user: null,
              isLoading: false,
              isAuthenticated: false,
              isAdmin: false,
              isTaster: false,
            });
          }
        }
      } catch {
        if (!cancelled) {
          setAuthState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            isTaster: false,
          });
        }
      }
    }

    fetchAuthState();
    return () => {
      cancelled = true;
    };
  }, []);

  return authState;
}
