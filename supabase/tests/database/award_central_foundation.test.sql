begin;
select plan(47);
select has_table('public', 'award_central_instruments', 'shared central instrument table exists');
select has_table('public', 'award_central_versions', 'shared version table exists');
select has_column('public', 'award_central_versions', 'source_sha256', 'content provenance stored');
select has_column('public', 'award_central_versions', 'effective_from', 'date boundaries stored');
select has_column('public', 'award_central_versions', 'reviewed_by', 'specialist reviewer identity field exists');
select has_column('public', 'award_central_versions', 'source_clause_refs', 'source clause references exist');
select has_column('public', 'award_central_versions', 'rule_proposal', 'draft rule contract exists');
select has_pk('public', 'award_central_versions', 'version primary key exists');
select has_fk('public', 'award_central_versions', 'instrument foreign key exists');
select is((select relrowsecurity from pg_class where oid='public.award_central_versions'::regclass), true, 'RLS enforced');
select is((select relrowsecurity from pg_class where oid='public.award_central_instruments'::regclass), true, 'instrument RLS enforced');
select ok(not has_table_privilege('authenticated', 'public.award_central_versions', 'INSERT'), 'customers cannot insert award rules');
select ok(not has_table_privilege('authenticated', 'public.award_central_versions', 'UPDATE'), 'customers cannot change award rules');
select ok(not has_table_privilege('authenticated', 'public.award_central_versions', 'DELETE'), 'customers cannot delete award rules');

select has_table('public', 'award_central_source_snapshots', 'immutable source snapshots are stored centrally');
select has_column('public', 'award_central_source_snapshots', 'content_bytes', 'original source bytes are retained');
select has_column('public', 'award_central_source_snapshots', 'source_sha256', 'source content hash is stored');
select has_column('public', 'award_central_source_snapshots', 'effective_from', 'source effective date is stored');
select has_column('public', 'award_central_source_snapshots', 'variation_references', 'source variation history is stored');
select has_column('public', 'award_central_source_snapshots', 'unresolved_fields', 'source data gaps are recorded');
select has_column('public', 'award_central_versions', 'source_snapshot_id', 'draft versions can cite exact source artifacts');
select ok(exists (
  select 1
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and c.conrelid = 'public.award_central_versions'::regclass
    and c.confrelid = 'public.award_central_source_snapshots'::regclass
    and a.attname = 'source_snapshot_id'
), 'version provenance references the exact source snapshot table');
select is((select relrowsecurity from pg_class where oid='public.award_central_source_snapshots'::regclass),
  true, 'source snapshot RLS is enabled');
select ok(not has_table_privilege('authenticated', 'public.award_central_source_snapshots', 'SELECT'),
  'customers cannot read stored source documents');
select ok(not has_table_privilege('authenticated', 'public.award_central_source_snapshots', 'INSERT'),
  'customers cannot stage source documents');
select ok(has_table_privilege('service_role', 'public.award_central_source_snapshots', 'INSERT'),
  'trusted ingestion service can stage source documents');
select ok(not has_table_privilege('service_role', 'public.award_central_source_snapshots', 'UPDATE'),
  'trusted ingestion service cannot rewrite source documents');
select ok(not has_table_privilege('service_role', 'public.award_central_source_snapshots', 'DELETE'),
  'trusted ingestion service cannot delete source documents');

insert into public.award_central_source_snapshots (
  id, source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes,
  fields_present, unresolved_fields
) values (
  'a1700000-0000-4000-8000-000000000001', 'synthetic-test-document', 'award_instrument',
  'https://www.fwc.gov.au/test-document', '2026-01-01 00:00:00+00', 'text/plain',
  convert_to('synthetic pgTAP content; not an official source', 'UTF8'), '[]'::jsonb, '["effective_from"]'::jsonb
);
select is(
  (select source_sha256 from public.award_central_source_snapshots
   where id = 'a1700000-0000-4000-8000-000000000001'),
  encode(extensions.digest(convert_to('synthetic pgTAP content; not an official source', 'UTF8'), 'sha256'), 'hex'),
  'database computes a content hash from the stored original bytes'
);
select is(
  (select status from public.award_central_source_snapshots
   where id = 'a1700000-0000-4000-8000-000000000001'),
  'staged',
  'source snapshots cannot be activated'
);
insert into public.award_central_instruments (id, instrument_code, instrument_name)
values ('a1700000-0000-4000-8000-000000000002', 'TEST-1700', 'Synthetic test instrument');
insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values (
  'a1700000-0000-4000-8000-000000000003',
  'a1700000-0000-4000-8000-000000000002',
  'synthetic-draft',
  '2026-01-01',
  'https://www.fwc.gov.au/test-document',
  encode(extensions.digest(convert_to('synthetic pgTAP content; not an official source', 'UTF8'), 'sha256'), 'hex'),
  '2026-01-01 00:00:00+00',
  'a1700000-0000-4000-8000-000000000001'
);
select is(
  (select source_snapshot_id from public.award_central_versions
   where id = 'a1700000-0000-4000-8000-000000000003'),
  'a1700000-0000-4000-8000-000000000001'::uuid,
  'draft version preserves the exact source snapshot identifier'
);
select throws_ok($$insert into public.award_central_versions (
  instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at
) values ('a1700000-0000-4000-8000-000000000002', 'missing-source', '2026-01-01',
  'https://www.fwc.gov.au/test-document',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '2026-01-01 00:00:00+00')$$, 'P0001',
  'New Award Central versions require an immutable source snapshot',
  'new award versions require source provenance');
select throws_ok($$insert into public.award_central_versions (
  instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values ('a1700000-0000-4000-8000-000000000002', 'mismatched-source', '2026-01-01',
  'https://www.fwc.gov.au/test-document',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '2026-01-01 00:00:00+00', 'a1700000-0000-4000-8000-000000000001')$$, 'P0001',
  'Award Central version provenance must match its source snapshot',
  'version hash must match the immutable source artifact');
select throws_ok($$update public.award_central_source_snapshots set source_identity = 'changed'
  where id = 'a1700000-0000-4000-8000-000000000001'$$, 'P0001',
  'Award Central source snapshots are immutable', 'source evidence cannot be edited');
select throws_ok($$delete from public.award_central_source_snapshots
  where id = 'a1700000-0000-4000-8000-000000000001'$$, 'P0001',
  'Award Central source snapshots are immutable', 'source evidence cannot be deleted');
select throws_ok($$insert into public.award_central_source_snapshots (
  source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes
) values ('untrusted', 'award_instrument', 'https://example.com/award', now(), 'text/plain', convert_to('x', 'UTF8'))$$,
  '23514', null, 'non-authoritative hosts cannot be recorded as official sources');
select throws_ok($$insert into public.award_central_source_snapshots (
  source_identity, source_kind, source_url, retrieved_at, effective_from, effective_until,
  content_type, content_bytes
) values ('reversed-dates', 'variation_notice', 'https://www.fwc.gov.au/variation',
  now(), '2026-02-01', '2026-01-01', 'text/plain', convert_to('x', 'UTF8'))$$,
  '23514', null, 'source effective-date boundaries are validated');
select throws_ok($$insert into public.award_central_source_snapshots (
  source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes
) values ('incomplete-mapd', 'pay_database_api', 'https://api.fwc.gov.au/awards',
  now(), 'application/json', convert_to('{}', 'UTF8'))$$,
  '23514', null, 'MAPD snapshots must record the documented coverage limitations');
select throws_ok($$insert into public.award_central_source_snapshots (
  source_identity, source_kind, source_url, retrieved_at, content_type, content_bytes
) values ('synthetic-test-document', 'award_instrument', 'https://www.fwc.gov.au/test-document',
  now(), 'text/plain', convert_to('synthetic pgTAP content; not an official source', 'UTF8'))$$,
  '23505', null, 'duplicate source content is idempotently rejected');

insert into public.award_central_versions (
  id, instrument_id, version_label, effective_from, source_url, source_sha256, retrieved_at, source_snapshot_id
) values (
  'a1700000-0000-4000-8000-000000000004',
  'a1700000-0000-4000-8000-000000000002',
  'synthetic-unreviewed-draft',
  '2026-07-01',
  'https://www.fwc.gov.au/test-document',
  encode(extensions.digest(convert_to('synthetic pgTAP content; not an official source', 'UTF8'), 'sha256'), 'hex'),
  '2026-01-01 00:00:00+00',
  'a1700000-0000-4000-8000-000000000001'
);
select throws_ok($$update public.award_central_versions
  set status = 'active', reviewed_by = 'reviewer', reviewed_at = now(), activated_at = now()
  where id = 'a1700000-0000-4000-8000-000000000004'$$, 'P0001',
  'Award Central publication requires review state', 'drafts cannot bypass specialist review');
update public.award_central_versions set status = 'pending_review'
  where id = 'a1700000-0000-4000-8000-000000000003';
update public.award_central_versions
  set status = 'active', reviewed_by = 'synthetic-specialist', reviewed_at = '2026-01-02 00:00:00+00',
      activated_at = '2026-01-03 00:00:00+00'
  where id = 'a1700000-0000-4000-8000-000000000003';
select is((select status from public.award_central_versions where id = 'a1700000-0000-4000-8000-000000000003'),
  'active', 'reviewed versions can be activated through the controlled lifecycle');
select throws_ok($$update public.award_central_versions set rule_proposal = '{"changed": true}'::jsonb
  where id = 'a1700000-0000-4000-8000-000000000003'$$, 'P0001',
  'Active Award Central version can only be superseded', 'active rules cannot be rewritten in place');
select throws_ok($$delete from public.award_central_versions
  where id = 'a1700000-0000-4000-8000-000000000003'$$, 'P0001',
  'Award Central versions cannot be deleted', 'published versions cannot be deleted');

set local role authenticated;
select is((select count(*)::int from public.award_central_versions
  where id = 'a1700000-0000-4000-8000-000000000003'), 1,
  'authenticated customers can read the shared active version');
select is((select count(*)::int from public.award_central_versions
  where id = 'a1700000-0000-4000-8000-000000000004'), 0,
  'authenticated customers cannot read unpublished drafts');
select throws_ok($$update public.award_central_versions set status = 'superseded'
  where id = 'a1700000-0000-4000-8000-000000000003'$$, '42501', null,
  'customers cannot supersede or override shared award versions');
reset role;

update public.award_central_versions set status = 'superseded'
  where id = 'a1700000-0000-4000-8000-000000000003';
select throws_ok($$update public.award_central_versions set status = 'active'
  where id = 'a1700000-0000-4000-8000-000000000003'$$, 'P0001',
  'Approved Award Central versions are immutable', 'superseded versions remain immutable for historical reproduction');
select * from finish();
rollback;
