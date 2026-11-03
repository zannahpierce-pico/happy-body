// Accounts and sync backend (Supabase). Leave empty to run without accounts.
// Both values are public by design: the publishable key only lets a signed-in
// person reach their own rows and files, enforced by the row-level security in
// supabase/setup.sql. Never put a secret or service_role key here.
export const SYNC_CONFIG = {
  url: '',      // https://<project-ref>.supabase.co
  anonKey: '',  // Project Settings → API Keys → publishable key (sb_publishable_…) or legacy anon key
};
