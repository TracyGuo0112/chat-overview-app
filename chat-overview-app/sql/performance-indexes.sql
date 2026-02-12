-- Performance indexes for chat-overview-app APIs.
-- Apply in production during low traffic windows.
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- Optional for LIKE "%keyword%" searches.
create extension if not exists pg_trgm;

-- /api/overview and /api/users: latest thread lookup, online/active windows.
create index concurrently if not exists idx_chat_thread_updated_at_desc
  on public.chat_thread (updated_at desc);

create index concurrently if not exists idx_chat_thread_user_updated_created
  on public.chat_thread (user_id, updated_at desc, created_at desc);

-- /api/overview: latest message per thread.
create index concurrently if not exists idx_chat_message_thread_created_desc
  on public.chat_message (thread_id, created_at desc);

-- /api/overview and /api/users: first message and active-user windows.
create index concurrently if not exists idx_chat_message_user_created_thread
  on public.chat_message (created_at, thread_id)
  where role = 'user';

create index concurrently if not exists idx_chat_message_assistant_created_thread
  on public.chat_message (created_at, thread_id)
  where role = 'assistant';

-- /api/users: registration-time filtering/sorting.
create index concurrently if not exists idx_user_created_at_desc
  on public."user" (created_at desc);

-- /api/users: nickname/email keyword search with lower(...) like '%keyword%'.
create index concurrently if not exists idx_user_email_lower_trgm
  on public."user" using gin (lower(email) gin_trgm_ops);

create index concurrently if not exists idx_user_name_lower_trgm
  on public."user" using gin (lower(name) gin_trgm_ops);

-- /api/membership-ops and /api/users: renewal ordering.
create index concurrently if not exists idx_redemption_history_user_redeemed_at
  on public.redemption_history (user_id, redeemed_at);

-- /api/overview: paid subscription status windows.
create index concurrently if not exists idx_redemption_grant_paid_status_period
  on public.redemption_grant (status, tier, period_end, period_start)
  where coalesce(tier, 0) > 0;

-- /api/overview: low remaining credits calculation.
create index concurrently if not exists idx_user_profile_chat_credits_num
  on public.user_profile ((
    case
      when (credits ->> 'chat') ~ '^[0-9]+$' then (credits ->> 'chat')::int
      else 0
    end
  ));
