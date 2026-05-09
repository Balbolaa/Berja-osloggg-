alter table public.tasks
add column latitude double precision,
add column longitude double precision;

create table public.telegram_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chat_id bigint unique,
  chat_username text,
  connect_token uuid not null default gen_random_uuid() unique,
  bot_started_at timestamptz,
  home_latitude double precision,
  home_longitude double precision,
  volunteer_radius_meters integer not null default 1000,
  volunteer_nearby_task_notifications boolean not null default true,
  requester_new_application_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_subscriptions_radius_check check (volunteer_radius_meters between 100 and 10000)
);

alter table public.telegram_subscriptions enable row level security;

create policy "Users can view own telegram subscription"
on public.telegram_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own telegram subscription"
on public.telegram_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own telegram subscription"
on public.telegram_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create trigger update_telegram_subscriptions_updated_at
before update on public.telegram_subscriptions
for each row execute function public.update_updated_at_column();

create extension if not exists pg_net;

create or replace function public.notify_telegram_about_new_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'open' then
    return new;
  end if;

  if new.latitude is null or new.longitude is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://wihyiqyptkxrwrwwnuzn.supabase.co/functions/v1/telegram-bot',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', 'task_created',
      'task_id', new.id
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create or replace function public.notify_telegram_about_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://wihyiqyptkxrwrwwnuzn.supabase.co/functions/v1/telegram-bot',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'event', 'application_created',
      'application_id', new.id
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create trigger telegram_notify_new_task
after insert on public.tasks
for each row execute function public.notify_telegram_about_new_task();

create trigger telegram_notify_new_application
after insert on public.task_applications
for each row execute function public.notify_telegram_about_new_application();
