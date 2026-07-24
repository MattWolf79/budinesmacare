-- Test script to verify email link generation fix
-- Run this in your Supabase database after applying the patch

-- Get a sample company ID to test with
-- SELECT id, slug FROM public.companies LIMIT 1;

-- Test the updated build_mail_app_link function
-- Replace 'YOUR_COMPANY_ID' with an actual company UUID

-- Test 1: Admin agenda link with company_id (should now include /admin#admin-agenda)
SELECT public.build_mail_app_link(
  (SELECT id FROM public.companies LIMIT 1),
  'admin-agenda'
) as admin_link;

-- Test 2: Employee agenda link with company_id
SELECT public.build_mail_app_link(
  (SELECT id FROM public.companies LIMIT 1),
  'employee-agenda'
) as employee_link;

-- Test 3: Verify it includes company slug
-- Expected format: https://quieroturnoapp.com.ar/{company_slug}/admin#admin-agenda
SELECT 
  (SELECT slug FROM public.companies LIMIT 1) as company_slug,
  public.build_mail_app_link(
    (SELECT id FROM public.companies LIMIT 1),
    'admin-agenda'
  ) as generated_link,
  case 
    when public.build_mail_app_link(
      (SELECT id FROM public.companies LIMIT 1),
      'admin-agenda'
    ) like '%/admin#admin-agenda' 
    then '✓ PASS: Contains /admin#admin-agenda'
    else '✗ FAIL: Missing /admin#admin-agenda'
  end as validation;

-- Test 4: Check that the trigger uses NEW.company_id
-- This just confirms the function is being called correctly in triggers
-- You'll need to manually test by creating a new booking and checking the email URL
SELECT 'Test email generation by creating a new booking with pending_assignment status' as next_step;
