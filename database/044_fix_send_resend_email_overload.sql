-- Fix ambiguous send_resend_email overload after tenant-aware mail changes.
-- Run after 042_platform_mail_tenant_links.sql.

begin;

drop function if exists public.send_resend_email(text, text, text, text, text, text, uuid);

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text,
  reply_to_value text,
  html_message_value text,
  company_id_value uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_to_email text := lower(trim(coalesce(to_email_value, '')));
  clean_reply_to text := lower(trim(coalesce(reply_to_value, '')));
  settings public.mail_settings%rowtype;
  sender_name text;
begin
  if not public.is_valid_email(clean_to_email) then
    return;
  end if;

  settings := public.get_mail_settings(company_id_value);

  if settings.resend_api_key is null then
    return;
  end if;

  sender_name := nullif(trim(coalesce(from_name_value, '')), '');
  if sender_name is null then
    sender_name := settings.from_name;
  end if;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || settings.resend_api_key
    ),
    body := jsonb_strip_nulls(jsonb_build_object(
      'from', sender_name || ' <' || settings.from_email || '>',
      'to', jsonb_build_array(clean_to_email),
      'subject', subject_value,
      'text', message_value,
      'html', nullif(html_message_value, ''),
      'reply_to', case when public.is_valid_email(clean_reply_to) then clean_reply_to else settings.from_email end
    )),
    timeout_milliseconds := 5000
  );
end;
$$;

create or replace function public.send_resend_email(
  to_email_value text,
  subject_value text,
  message_value text,
  from_name_value text,
  reply_to_value text,
  html_message_value text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_resend_email(
    to_email_value::text,
    subject_value::text,
    message_value::text,
    from_name_value::text,
    reply_to_value::text,
    html_message_value::text,
    null::uuid
  );
end;
$$;

revoke execute on function public.send_resend_email(text, text, text, text, text, text, uuid) from public;
revoke execute on function public.send_resend_email(text, text, text, text, text, text) from public;

commit;
