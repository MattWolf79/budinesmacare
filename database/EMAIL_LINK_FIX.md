# Email Link Routing Fix - Database Patch

## Problem
Email notifications for "Asignar turno" (pending booking assignments) were routing to the client interface instead of the admin interface. The link should go to `/admin#admin-agenda` but was going to the client/main page.

## Root Cause
There were **two conflicting versions** of the email notification functions:
- **File 02**: Simple version without company_id, generating plain text emails without links
- **File 03**: Updated version with company_id, generating HTML emails with buttons
- **File 04**: Newest version with all fixes (but not being used)

When migrations run in sequence (01 → 02 → 03 → ...), the trigger defined in file 02 needs to call the updated function from file 03. However, if migrations are executed out of order or partially, the old version persists.

## Changes Made

### File 02: `02_configuracion_agenda_cierres_015_033.sql`

#### 1. Added `html_escape()` function
Escapes HTML special characters for safe rendering in email templates

#### 2. Added/Updated `get_mail_app_url()` function
```sql
create or replace function public.get_mail_app_url(company_id_value uuid default null)
```
- Accepts optional `company_id_value` parameter
- Returns base URL for email links

#### 3. Added/Updated `build_mail_app_link()` function  
```sql
create or replace function public.build_mail_app_link(company_id_value uuid default null, hash_value text default '')
```
- Accepts `company_id_value` to retrieve company slug
- Accepts `hash_value` for routing (e.g., 'admin-agenda', 'employee-agenda')
- Builds URLs with pattern: `base_url + '/' + company_slug + '/admin#hash_value`
- **Old**: No company slug, missing /admin path
- **New**: Includes company slug and /admin path

#### 4. Added `format_booking_notification_html()` function
```sql
create or replace function public.format_booking_notification_html(
  booking_value public.bookings,
  event_label text,
  cta_label text default null,
  cta_url text default null
)
```
- Generates HTML email templates
- Accepts `cta_label` (button text) and `cta_url` (button link)
- Renders professional email with booking details and CTA button
- Example: Button "Asignar turno" that links to admin agenda

#### 5. Updated `send_booking_email_notifications()` trigger function
**OLD** (plain text, no links):
```sql
admin_message := public.format_booking_notification_message(...);
perform public.notify_admin_emails(...);  -- No URL!
```

**NEW** (HTML with clickable button):
```sql
employee_agenda_url := public.build_mail_app_link(NEW.company_id, 'employee-agenda');
admin_assignment_url := public.build_mail_app_link(NEW.company_id, 'admin-agenda');
admin_html := public.format_booking_notification_html(..., 'Asignar turno', admin_assignment_url);
perform public.send_resend_email(..., admin_html);  -- HTML with button!
```

### File 03: `03_multitenant_plataforma_034_049.sql`
- Already updated with correct functions (no additional changes needed)
- Provides fallback versions if file 02 doesn't execute properly

## Expected Result
After applying this patch, emails will have:

**Before:**
```
Email: "Hay un turno pendiente para asignar."
Link in text: https://quieroturnoapp.com.ar/#admin-agenda  ❌ Wrong
(No company slug, routes to homepage not admin)
```

**After:**
```
Email: "Hay un turno pendiente para asignar."
Button: "Asignar turno" 
Link: https://quieroturnoapp.com.ar/empresa-slug/admin#admin-agenda  ✅ Correct
(Includes company slug and /admin path, routes to admin interface)
```

## Deployment Steps
1. **Backup** your Supabase database
2. **Apply** the updated SQL files:
   - `02_configuracion_agenda_cierres_015_033.sql` (primary changes)
   - `03_multitenant_plataforma_034_049.sql` (already updated, for redundancy)
3. **Run test queries** from `test_email_links.sql` to validate function outputs
4. **Create a test booking** with `pending_assignment` status
5. **Verify** the email link navigates to `/admin#admin-agenda`
6. **Deploy** to production when verified

## Verification Queries
```sql
-- Test URL generation
SELECT public.build_mail_app_link(
  (SELECT id FROM public.companies LIMIT 1),
  'admin-agenda'
) as admin_link;

-- Should return something like:
-- https://quieroturnoapp.com.ar/empresa-slug/admin#admin-agenda
```

## Backward Compatibility
- All new functions maintain backward compatibility with default parameters
- Existing code can continue using functions without passing company_id
- The trigger automatically passes company_id from booking record

## Files Modified
- `database/consolidado/02_configuracion_agenda_cierres_015_033.sql` ⭐ PRIMARY FIX
  - Added 5 new/updated functions for email link generation and HTML rendering
- `database/consolidado/03_multitenant_plataforma_034_049.sql` (Already updated)
- `database/consolidado/04_turnos_empleados_rendiciones_050_065.sql` (Newest version, for reference)
