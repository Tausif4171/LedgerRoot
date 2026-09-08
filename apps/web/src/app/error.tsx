"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1>This view could not load</h1>
      <p>Your saved records have not been changed.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
