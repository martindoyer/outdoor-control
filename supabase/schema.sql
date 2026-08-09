-- Run this in the Supabase SQL editor for your project.

create table if not exists outdoor_devices (
  uuid text primary key,          -- Meross device id
  custom_name text,               -- your override for the display name
  icon text,                      -- reserved for future custom icon choice
  sort_order int default 0,       -- reserved for future manual ordering
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Keep updated_at current on every change
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists outdoor_devices_updated_at on outdoor_devices;
create trigger outdoor_devices_updated_at
before update on outdoor_devices
for each row execute procedure set_updated_at();

-- Row Level Security: this is a single-user app reading/writing with the
-- anon key from the browser, so keep it open. If you ever add auth,
-- tighten this to auth.uid()-based policies instead.
alter table outdoor_devices enable row level security;

drop policy if exists "allow anon read" on outdoor_devices;
create policy "allow anon read" on outdoor_devices
  for select using (true);

drop policy if exists "allow anon write" on outdoor_devices;
create policy "allow anon write" on outdoor_devices
  for all using (true) with check (true);
