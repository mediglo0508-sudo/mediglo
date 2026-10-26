import { createClient } from "@supabase/supabase-js";

// NOTE ON TYPES: this project types query results with the hand-written
// interfaces in `src/types/*.ts` (Customer, Invoice, Appointment, ...) rather
// than a generated `Database` generic. Once you connect a real Supabase
// project, you can optionally run:
//   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.types.ts
// and pass that as createClient<Database>(...) for full end-to-end inference.
// The hand-written interfaces already match the schema in supabase/migrations
// and are what every hook/component in this app imports.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Deliberately loud: a misconfigured deployment should fail fast in the console
  // rather than silently making every query fail with a confusing network error.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project's values."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
