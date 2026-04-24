"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "../../components/layout/PageWrapper";
import { ClaimFlow } from "../../components/claim/ClaimFlow";

export default function ClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  return (
    <PageWrapper narrow>
      <ClaimFlow token={token} />
    </PageWrapper>
  );
}
