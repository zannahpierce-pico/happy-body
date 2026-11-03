// Accounts and sync backend (Supabase). Leave empty to run without accounts.
// Both values are public by design: the publishable key only lets a signed-in
// person reach their own rows and files, enforced by the row-level security in
// supabase/setup.sql. Never put a secret or service_role key here.
export const SYNC_CONFIG = {
  url: 'https://dokuxddmlzxgypktbydx.supabase.co',
  anonKey: 'sb_publishable_HvKOgZk-B6paIfgyHiahZQ_t8neEwUy', // publishable key (Project Settings → API Keys)
};
