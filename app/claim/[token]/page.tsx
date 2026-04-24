"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "../../components/layout/PageWrapper";
import { ClaimFlow } from "../../components/claim/ClaimFlow";

// NOTE: page-level metadata (title / description / og) for /claim/[token]
// lives in `app/claim/[token]/metadata.ts` — route segment metadata has
// to be exported from a server module, which this "use client" file
// can't be. The per-segment `opengraph-image.tsx` sibling handles the
// image, and Next merges the static description below from metadata.ts.

export default function ClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  return (
    <PageWrapper narrow>
      <ClaimFlow token={token} />
    </PageWrapper>
  );
}
