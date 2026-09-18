/**
 * The seat price for the active language, read from itera-api (which reads it
 * from Stripe). componente → hook → service.
 *
 * `getPricing` degrades to `null` instead of throwing, so the subscribe button
 * keeps working when the quote fails — the server picks the price again at
 * Checkout time either way.
 */
import { useQuery } from '@tanstack/react-query';
import { getPricing } from '@/services/billing.service';
import { queryKeys } from '@/lib/queryKeys';

export function useSeatPricing(locale: string) {
  return useQuery({
    queryKey: queryKeys.seatPricing(locale),
    queryFn: () => getPricing(locale),
    // A Stripe price is immutable; the quote only changes on a redeploy.
    staleTime: 10 * 60_000,
  });
}
