-- Store OpenRouter webhook usage events as transaction rows.

begin;

create table if not exists public.transactions (
	id bigserial primary key,
	api_key_name text not null,
	end_time bigint not null,
	input_cost numeric not null default 0,
	output_cost numeric not null default 0,
	total_cost numeric not null default 0,
	input_tokens integer not null default 0,
	thinking_tokens integer not null default 0,
	response_tokens integer not null default 0,
	finish_reason text,
	created_at timestamptz not null default now()
);

create index if not exists transactions_api_key_name_idx on public.transactions (api_key_name);
create index if not exists transactions_end_time_idx on public.transactions (end_time);

grant select, insert on table public.transactions to service_role;
grant usage, select on sequence public.transactions_id_seq to service_role;

alter table public.transactions enable row level security;

commit;
