// Server-side Supabase client for server functions and server routes.
import { createClient } from '@supabase/supabase-js';
import { getRequest } from '@tanstack/react-start/server';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    import.meta.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_PUBLISHABLE_KEY =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL environment variable.');
  }

  if (SUPABASE_SERVICE_ROLE_KEY) {
    return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing SUPABASE_PUBLISHABLE_KEY environment variable.');
  }

  // Localhost fallback when SUPABASE_SERVICE_ROLE_KEY is not present:
  // forward the caller's Bearer JWT from the current server request so RLS policies
  // evaluate as the authenticated user (e.g. Admin / Accountant / Reception).
  let authHeader: string | null = null;
  try {
    const req = getRequest();
    authHeader = req?.headers?.get('authorization') ?? null;
  } catch {
    authHeader = null;
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
      return Reflect.get(_supabaseAdmin, prop, receiver);
    }
    const client = createSupabaseAdminClient();
    return Reflect.get(client, prop, receiver);
  },
});
