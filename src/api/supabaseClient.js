import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://timouxhoibsjigbfrisi.supabase.co";
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_6lEYFHo2bN3PaHTTGDgw9g_hizJT4Vb";

export const supabase = createClient(supabaseUrl, supabaseKey);
