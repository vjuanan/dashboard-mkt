-- Create table for Monthly Budgets
create table if not exists public.monthly_budgets (
  id uuid default gen_random_uuid() primary key,
  month text not null, -- Format 'YYYY-MM'
  google_budget numeric default 0,
  meta_budget numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint monthly_budgets_month_key unique (month)
);

-- RLS policies
alter table public.monthly_budgets enable row level security;
create policy "Allow all access to public" on public.monthly_budgets for all using (true) with check (true);
