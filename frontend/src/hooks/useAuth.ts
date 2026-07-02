import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@/types';
import { usersApi } from '@/api/users';

interface IdentityState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

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
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchIdentity(retries = 3, delayMs = 100) {
      try {
        const isRetry = retries < 3;
        const data = await fetchAuthMe(isRetry);

        if (cancelled) return;

        if (data.clientPrincipal) {
          const { userId, claims, userDetails } = data.clientPrincipal;
          const nameClaim =
            claims?.find((c) => c.typ === 'name') ??
            claims?.find((c) => c.typ === 'preferred_username') ??
            claims?.find((c) => c.typ === 'upn');

          // Detect Azure SWA masked userDetails (e.g. "vil*****") —
          // a few real characters followed by a run of asterisks.
          // Uses a specific pattern to avoid false positives on Entra ID
          // UPNs/display names that may legitimately contain a single '*'.
          const isDetailsMasked =
            typeof userDetails === 'string' &&
            /^.{1,5}\*{2,}$/.test(userDetails);

          if (isDetailsMasked && retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            if (!cancelled) return fetchIdentity(retries - 1, delayMs * 2);
            return;
          }

          if (isDetailsMasked) {
            // Retries exhausted but data is still masked — treat as failure
            // rather than rendering a corrupted username like "vil*****".
            console.warn(
              'useIdentity: /.auth/me still returned masked userDetails after all retries. ' +
                'Azure SWA may have changed its response format.',
            );
            if (!cancelled) {
              setState({
                user: null,
                isLoading: false,
                isAuthenticated: false,
              });
            }
            return;
          }

          if (!cancelled) {
            setState({
              user: {
                id: userId,
                email: userDetails,
                name: nameClaim?.val ?? userDetails,
                // Legacy field retained on the User type for compatibility;
                // real authorization role comes from the DB (see useAuth).
                role: 'user',
              },
              isLoading: false,
              isAuthenticated: true,
            });
          }
        } else {
          if (!cancelled) {
            setState({ user: null, isLoading: false, isAuthenticated: false });
          }
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, isLoading: false, isAuthenticated: false });
        }
      }
    }

    fetchIdentity();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * Combines SWA identity with the app-managed DB role (from
 * GET /api/users/me) to produce the authoritative isAdmin/isTaster flags.
 * `admin` implies `taster`.
 */
export function useAuth(): AuthState {
  const identity = useIdentity();

  const profileQuery = useQuery({
    queryKey: ['userProfile'],
    queryFn: usersApi.getMe,
    enabled: identity.isAuthenticated,
  });

  const role = profileQuery.data?.role;
  const isAdmin = role === 'admin';
  const isTaster = role === 'taster' || isAdmin;

  const isLoading =
    identity.isLoading || (identity.isAuthenticated && profileQuery.isLoading);

  return {
    user: identity.user,
    isLoading,
    isAuthenticated: identity.isAuthenticated,
    isAdmin,
    isTaster,
  };
}
