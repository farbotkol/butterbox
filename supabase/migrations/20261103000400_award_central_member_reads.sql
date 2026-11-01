drop policy "Authenticated users read central instruments"
  on public.award_central_instruments;
drop policy "Authenticated users read active central versions"
  on public.award_central_versions;

create policy "Business members read central instruments"
  on public.award_central_instruments for select to authenticated
  using (
    (select exists (
      select 1 from public.business_memberships as membership
      where membership.user_id = (select auth.uid())
    ))
  );

create policy "Business members read active central versions"
  on public.award_central_versions for select to authenticated
  using (
    status = 'active'
    and (select exists (
      select 1 from public.business_memberships as membership
      where membership.user_id = (select auth.uid())
    ))
  );
