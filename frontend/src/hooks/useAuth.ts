import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@/types';
import { usersApi } from '@/api/users';
import { authApi, type ClientPrincipal } from '@/api/auth';

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
  clientPrincipal: ClientPrincipal | null;
}

const ANONYMOUS: IdentityState = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
};

function toIdentity(principal: ClientPrincipal): IdentityState {
  const { userId, claims, userDetails, identityProvider } = principal;
  const nameClaim =
    claims?.find((c) => c.typ === 'name') ??
    claims?.find((c) => c.typ === 'preferred_username') ??
    claims?.find((c) => c.typ === 'upn');

  return {
    user: {
      id: userId,
      // Native accounts have no email; userDetails is their username.
      email: identityProvider === 'local' ? '' : userDetails,
      name: nameClaim?.val ?? userDetails,
      // Legacy field retained on the User type for compatibility;
      // real authorization role comes from the DB (see useAuth).
      role: 'user',
      provider: identityProvider,
    },
    isLoading: false,
    isAuthenticated: true,
  };
}

/**
 * Native username/password session (app-managed cookie), consulted when
 * SWA reports no signed-in user. Any failure resolves to anonymous.
 */
async function fetchNativeIdentity(): Promise<IdentityState> {
  try {
    const principal = await authApi.getSession();
    return principal ? toIdentity(principal) : ANONYMOUS;
  } catch {
    return ANONYMOUS;
  }
}

/**
 * Resolves the authenticated identity (userId/name/email). SWA's /.auth/me
 * (Entra ID) is checked first; if it has no principal — or isn't available,
 * e.g. in local Vite dev — the native session from /api/auth/me is used.
 * This is identity only — it does NOT determine admin/taster
 * authorization. Authorization comes from the app's own `users` document
 * (DB role), sourced via useAuth below.
 */
function useIdentity(): IdentityState {
  const [state, setState] = useState<IdentityState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchSwaIdentity(
      retries = 3,
      delayMs = 100,
    ): Promise<IdentityState | null> {
      let data: SwaAuthResponse;
      try {
        const response = await fetch('/.auth/me');
        data = await response.json();
      } catch {
        return null;
      }

      if (cancelled || !data.clientPrincipal) return null;

      const { userDetails } = data.clientPrincipal;
      // Detect Azure SWA masked userDetails (e.g. "vil*****") —
      // a few real characters followed by a run of asterisks.
      // Uses a specific pattern to avoid false positives on Entra ID
      // UPNs/display names that may legitimately contain a single '*'.
      const isDetailsMasked =
        typeof userDetails === 'string' && /^.{1,5}\*{2,}$/.test(userDetails);

      if (isDetailsMasked && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (cancelled) return null;
        return fetchSwaIdentity(retries - 1, delayMs * 2);
      }

      if (isDetailsMasked) {
        // Retries exhausted but data is still masked — treat as failure
        // rather than rendering a corrupted username like "vil*****".
        console.warn(
          'useIdentity: /.auth/me still returned masked userDetails after all retries. ' +
            'Azure SWA may have changed its response format.',
        );
        return ANONYMOUS;
      }

      return toIdentity(data.clientPrincipal);
    }

    async function resolveIdentity() {
      const identity =
        (await fetchSwaIdentity()) ?? (await fetchNativeIdentity());
      if (!cancelled) setState(identity);
    }

    resolveIdentity();
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
