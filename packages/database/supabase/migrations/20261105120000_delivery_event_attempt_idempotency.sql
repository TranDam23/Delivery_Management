alter table public.delivery_events
  add column leg_attempt_no integer,
  add constraint delivery_events_leg_attempt_no_positive_check
    check (leg_attempt_no is null or leg_attempt_no > 0) not valid;

create unique index idx_delivery_events_delivery_attempt_status_unique
  on public.delivery_events (delivery_id, leg_attempt_no, status_id)
  where leg_attempt_no is not null;
