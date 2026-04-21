-- Add model to transactions and enforce non-null values.

begin;

alter table public.transactions
	add column if not exists model text;

update public.transactions
set model = 'unknown'
where model is null;

alter table public.transactions
	alter column model set not null;

commit;
