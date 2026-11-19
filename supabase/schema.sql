-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run
create table if not exists ultron_settings (
  id int primary key default 1,
  toggles jsonb not null default '{
    "studyPersonality": true,
    "learnOnlineTimes": true,
    "introduceAsAssistant": true,
    "rudeToOthers": false,
    "praiseOwner": true,
    "antiSpamWhenScrolling": true,
    "learnNames": true,
    "recordHistoryOffline": true,
    "narcissist": false
  }'::jsonb,
  owner_status text not null default 'online', -- online | scrolling | offline
  updated_at timestamptz default now()
);
insert into ultron_settings (id) values (1) on conflict do nothing;

create table if not exists ultron_messages (
  id bigserial primary key,
  channel text default 'dashboard',
  contact_id text,
  contact_name text,
  role text,            -- owner | contact | ultron
  content text,
  owner_status text,
  created_at timestamptz default now()
);
create index if not exists ultron_messages_contact_idx on ultron_messages (contact_id, created_at desc);

create table if not exists ultron_contacts (
  contact_id text primary key,
  channel text,
  username text,
  display_name text,
  updated_at timestamptz default now()
);

create table if not exists ultron_owner_activity (
  id bigserial primary key,
  hour_ist int,
  dow int,
  created_at timestamptz default now()
);

-- Backend uses the service key, so lock the tables from public access
alter table ultron_settings enable row level security;
alter table ultron_messages enable row level security;
alter table ultron_contacts enable row level security;
alter table ultron_owner_activity enable row level security;
