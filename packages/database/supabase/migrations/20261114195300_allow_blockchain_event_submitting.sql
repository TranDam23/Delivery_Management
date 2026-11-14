alter table public.blockchain_events
  drop constraint if exists blockchain_events_tx_status_check;

alter table public.blockchain_events
  add constraint blockchain_events_tx_status_check
  check (tx_status in ('pending', 'submitting', 'confirmed', 'failed'));
