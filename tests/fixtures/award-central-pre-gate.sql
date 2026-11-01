-- Run only against the verified disposable database, before the publication-block migration.
insert into public.award_central_source_snapshots
  (id, source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes)
values ('a1310000-0000-4000-8000-000000000001', 'synthetic-legacy-source', 'award_instrument',
  'https://www.fwc.gov.au/synthetic-legacy', '2026-01-01 00:00:00+00', 'text/plain',
  convert_to('synthetic legacy fixture; not an official source', 'UTF8'));
insert into public.award_central_instruments (id, instrument_code, instrument_name)
values ('a1310000-0000-4000-8000-000000000002', 'TEST-1310', 'Synthetic legacy instrument');
insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values
  ('a1310000-0000-4000-8000-000000000003', 'a1310000-0000-4000-8000-000000000002', 'legacy-active',
   '2026-01-01', 'https://www.fwc.gov.au/synthetic-legacy',
   encode(extensions.digest(convert_to('synthetic legacy fixture; not an official source', 'UTF8'), 'sha256'), 'hex'),
   '2026-01-01 00:00:00+00', 'a1310000-0000-4000-8000-000000000001'),
  ('a1310000-0000-4000-8000-000000000004', 'a1310000-0000-4000-8000-000000000002', 'legacy-review',
   '2026-07-01', 'https://www.fwc.gov.au/synthetic-legacy',
   encode(extensions.digest(convert_to('synthetic legacy fixture; not an official source', 'UTF8'), 'sha256'), 'hex'),
   '2026-01-01 00:00:00+00', 'a1310000-0000-4000-8000-000000000001');
update public.award_central_versions set status = 'pending_review'
where id in ('a1310000-0000-4000-8000-000000000003', 'a1310000-0000-4000-8000-000000000004');
update public.award_central_versions
set status = 'active', reviewed_by = 'synthetic-reviewer',
    reviewed_at = '2026-01-02 00:00:00+00', activated_at = '2026-01-03 00:00:00+00'
where id = 'a1310000-0000-4000-8000-000000000003';
