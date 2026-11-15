"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  decryptXeroTokenSet, isXeroUuid, revokeXeroToken, XeroOAuthError,
} from "@/lib/xero-oauth";
import { xeroConfig, getXeroTenantGrant } from "@/lib/xero-oauth-server";
import { getXeroAdminWorkspace } from "@/lib/xero-workspace";

function destination(businessId: string, value: string) {
  return `/settings/payroll/xero?business=${encodeURIComponent(businessId)}&error=${encodeURIComponent(value)}`;
}

function singleId(formData: FormData, key: string) {
  const values = formData.getAll(key);
  return values.length === 1 && typeof values[0] === "string" && isXeroUuid(values[0])
    ? values[0].toLowerCase() : null;
}

export async function selectXeroOrganizationAction(formData: FormData) {
  const businessId = singleId(formData, "business");
  const grantId = singleId(formData, "grant");
  const tenantId = singleId(formData, "tenant");
  if (!businessId || !grantId || !tenantId) redirect("/settings/payroll/xero?error=invalid");
  const workspace = await getXeroAdminWorkspace(businessId);
  if (!workspace) redirect(destination(businessId, "permission"));
  const { data, error } = await workspace.supabase.rpc("select_xero_oauth_tenant", {
    p_business_id: businessId,
    p_grant_id: grantId,
    p_tenant_id: tenantId,
  });
  if (error || typeof data !== "string" || data.toLowerCase() !== tenantId) {
    const message = error && typeof error === "object" ? (error as { message?: unknown }).message : undefined;
    redirect(destination(businessId,
      message === "Xero organization is already connected" ? "duplicate" : "selection"));
  }
  revalidatePath("/settings/payroll/xero");
  revalidatePath("/settings/payroll");
  redirect(`/settings/payroll/xero?business=${encodeURIComponent(businessId)}&connected=1`);
}

export async function disconnectXeroOrganizationAction(formData: FormData) {
  const businessId = singleId(formData, "business");
  const tenantId = singleId(formData, "tenant");
  if (!businessId || !tenantId) redirect("/settings/payroll/xero?error=invalid");
  const workspace = await getXeroAdminWorkspace(businessId);
  if (!workspace) redirect(destination(businessId, "permission"));

  let grant;
  try {
    grant = await getXeroTenantGrant(workspace.supabase, businessId, tenantId);
  } catch {
    redirect(destination(businessId, "disconnect"));
  }
  if (!grant) redirect(destination(businessId, "disconnect"));

  if (grant.tenantCount === 1) {
    const lockId = randomUUID();
    const { data: claimData, error: claimError } = await workspace.supabase.rpc(
      "claim_xero_oauth_disconnection", {
        p_business_id: businessId,
        p_tenant_id: tenantId,
        p_lock_id: lockId,
      },
    );
    const claim = Array.isArray(claimData) ? claimData[0] : claimData;
    if (claimError || !claim || typeof claim !== "object" ||
      typeof claim.encrypted_tokens !== "string" || claim.grant_id !== grant.grantId) {
      redirect(destination(businessId, "disconnect"));
    }

    try {
      const config = xeroConfig();
      const tokens = decryptXeroTokenSet(config, businessId, grant.grantId, claim.encrypted_tokens);
      await revokeXeroToken(config, tokens.refreshToken);
    } catch (error) {
      await workspace.supabase.rpc("finish_xero_oauth_disconnection", {
        p_business_id: businessId,
        p_tenant_id: tenantId,
        p_lock_id: lockId,
        p_revoked: false,
      });
      redirect(destination(businessId,
        error instanceof XeroOAuthError && error.code === "reauthorization"
          ? "revocation" : "disconnect"));
    }
    const { data: finished, error: finishError } = await workspace.supabase.rpc(
      "finish_xero_oauth_disconnection", {
        p_business_id: businessId,
        p_tenant_id: tenantId,
        p_lock_id: lockId,
        p_revoked: true,
      },
    );
    if (finishError || finished !== true) redirect(destination(businessId, "disconnect"));
  } else {
    const { data, error } = await workspace.supabase.rpc("disconnect_xero_oauth_tenant", {
      p_business_id: businessId,
      p_tenant_id: tenantId,
    });
    if (error || data !== true) redirect(destination(businessId, "disconnect"));
  }

  revalidatePath("/settings/payroll/xero");
  revalidatePath("/settings/payroll");
  redirect(`/settings/payroll/xero?business=${encodeURIComponent(businessId)}&disconnected=1`);
}

export async function cancelPendingXeroAuthorizationAction(formData: FormData) {
  const businessId = singleId(formData, "business");
  const grantId = singleId(formData, "grant");
  if (!businessId || !grantId) redirect("/settings/payroll/xero?error=invalid");
  const workspace = await getXeroAdminWorkspace(businessId);
  if (!workspace) redirect(destination(businessId, "permission"));

  const lockId = randomUUID();
  const { data, error } = await workspace.supabase.rpc("claim_pending_xero_oauth_revocation", {
    p_business_id: businessId,
    p_grant_id: grantId,
    p_lock_id: lockId,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row !== "object" || !("encrypted_tokens" in row)) {
    redirect(destination(businessId, "cancel"));
  }

  let revoked = false;
  try {
    const config = xeroConfig();
    const tokens = decryptXeroTokenSet(config, businessId, grantId, row.encrypted_tokens as string);
    await revokeXeroToken(config, tokens.refreshToken);
    revoked = true;
  } catch {
    await workspace.supabase.rpc("finish_pending_xero_oauth_revocation", {
      p_business_id: businessId,
      p_grant_id: grantId,
      p_lock_id: lockId,
      p_revoked: false,
    });
    redirect(destination(businessId, "disconnect"));
  }
  const result = await workspace.supabase.rpc("finish_pending_xero_oauth_revocation", {
    p_business_id: businessId,
    p_grant_id: grantId,
    p_lock_id: lockId,
    p_revoked: revoked,
  });
  if (result.error || result.data !== true) redirect(destination(businessId, "cancel"));
  revalidatePath("/settings/payroll/xero");
  redirect(`/settings/payroll/xero?business=${encodeURIComponent(businessId)}&cancelled=1`);
}
