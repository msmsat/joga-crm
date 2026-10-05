import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../../../api/billing/billing.api';
import { getActiveContextKey, getActiveToken, getUserRoleFromToken } from '../../../utils/auth';

const authContext = () => {
  const scope = getActiveContextKey();
  return { scope, signedIn: !!getActiveToken(), owner: getUserRoleFromToken() === 'owner', hasStudio: !!scope.split(':')[0] };
};

export function useLandingPricing() {
  const [auth, setAuth] = useState(authContext);
  useEffect(() => {
    const refresh = () => setAuth(authContext());
    window.addEventListener('auth-context-changed', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('auth-context-changed', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const catalog = useQuery({
    queryKey: ['billing', 'public-plans'], queryFn: billingApi.getPublicPlans,
    staleTime: 10 * 60 * 1000, retry: 1,
  });
  const eligibility = useQuery({
    queryKey: ['landing', 'promo-eligibility', auth.scope],
    queryFn: billingApi.getPlan, enabled: auth.signedIn && auth.owner && auth.hasStudio,
    staleTime: 0, retry: false,
  });
  // No promotion is promised to an existing payer while eligibility is unknown.
  const promoAvailable = !auth.signedIn || (auth.owner && auth.hasStudio && eligibility.data?.first_payment_promo_available === true);
  return { catalog, signedIn: auth.signedIn, promo: promoAvailable ? catalog.data?.first_payment_promo : undefined };
}
