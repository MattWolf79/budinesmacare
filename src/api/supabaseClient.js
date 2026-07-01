import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gkwjrhdwbzsaqddhongq.supabase.co";
const supabaseKey = "sb_publishable_Lbyrc5EkTu0urZVJLPjWrw_kr9M0c3s";

export const supabase = createClient(supabaseUrl, supabaseKey);
