import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const publishableKey =
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

/** Same credentials as the Supabase dashboard "App frameworks" / React snippet. */
export const supabase =
  url && publishableKey ? createClient(url, publishableKey) : null;
