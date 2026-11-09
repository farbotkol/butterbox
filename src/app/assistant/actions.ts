"use server";

import { deniedAiProposalReview, reviewAiProposal } from "@/lib/ai-proposal-review";
import { createClient } from "@/lib/supabase/server";

export async function reviewAiProposalAction(request: unknown, response: unknown) {
  try {
    return await reviewAiProposal(await createClient(), request, response);
  } catch {
    return deniedAiProposalReview();
  }
}
