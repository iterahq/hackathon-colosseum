/**
 * Per-tenant white-label login branding (ADR-103 / ADR-F3).
 *
 * Reads itera.tenants.branding (logo_url / primary_color / login_bg) keyed by
 * ?tenant=<slug>. Falls back to default Itera branding. Public read — the
 * tenants row is selectable anonymously for the login screen only (a narrow
 * RLS policy exposing branding columns).
 */
import { useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface TenantBranding {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  loginBg: string | null;
}

const DEFAULT_BRANDING: TenantBranding = {
  slug: 'itera',
  name: 'Itera',
  logoUrl: null,
  primaryColor: null,
  loginBg: null,
};

export function useTenantBranding(): { branding: TenantBranding; loading: boolean } {
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('tenant');
    if (!slug || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getSupabase()
      .from('tenants')
      .select('slug,name,branding')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const b = (data.branding ?? {}) as Record<string, string>;
          setBranding({
            slug: data.slug,
            name: data.name,
            logoUrl: b.logo_url ?? null,
            primaryColor: b.primary_color ?? null,
            loginBg: b.login_bg ?? null,
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { branding, loading };
}
