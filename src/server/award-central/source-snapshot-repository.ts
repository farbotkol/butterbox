import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acquireAwardSource,
  type AwardSourceFetcher,
  type AwardSourceMetadata,
  type AwardSourceSnapshot,
} from "./source-ingestion.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function persistAwardSourceSnapshot(
  client: SupabaseClient,
  snapshot: AwardSourceSnapshot,
): Promise<{ id: string; sha256: string }> {
  const { data, error } = await client
    .from("award_central_source_snapshots")
    .insert({
      source_identity: snapshot.sourceIdentity,
      source_kind: snapshot.sourceKind,
      source_url: snapshot.sourceUrl,
      retrieved_at: snapshot.retrievedAt,
      effective_from: snapshot.effectiveFrom,
      effective_until: snapshot.effectiveUntil,
      source_revision: snapshot.sourceRevision,
      content_type: snapshot.contentType,
      content_bytes: `\\x${Buffer.from(snapshot.content).toString("hex")}`,
      variation_references: snapshot.variationReferences,
      fields_present: snapshot.fieldsPresent,
      unresolved_fields: snapshot.unresolvedFields,
    })
    .select("id,source_sha256")
    .single();

  if (error) throw new Error("Award source snapshot could not be persisted.", { cause: error });
  if (
    !data ||
    typeof data.id !== "string" ||
    !uuid.test(data.id) ||
    typeof data.source_sha256 !== "string" ||
    data.source_sha256 !== snapshot.sha256
  ) {
    throw new Error("Award source snapshot persistence returned invalid provenance.");
  }
  return { id: data.id, sha256: data.source_sha256 };
}

export async function stageAwardSource(
  client: SupabaseClient,
  url: string,
  metadata: AwardSourceMetadata,
  options: { fetcher?: AwardSourceFetcher; headers?: HeadersInit } = {},
): Promise<{ sourceSnapshotId: string; sha256: string; status: "staged" }> {
  const snapshot = await acquireAwardSource(url, metadata, options);
  const stored = await persistAwardSourceSnapshot(client, snapshot);
  return {
    sourceSnapshotId: stored.id,
    sha256: stored.sha256,
    status: "staged",
  };
}
