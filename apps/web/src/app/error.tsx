"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1>This view could not load</h1>
      <p>Try loading it again, or return to your documents.</p>
      <Button onClick={reset}>Try again</Button>
      <Link href="/documents" className="btn">
        Back to documents
      </Link>
    </div>
  );
}
