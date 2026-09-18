"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { loginReturn } from "@/lib/login-return";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const cache = useQueryClient();
  return (
    <div className="panel login">
      <h1>Sign in to your workspace</h1>
      <p className="muted" style={{ margin: "10px 0 24px" }}>
        Local accounts only. Public registration is disabled.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            const response = await fetch("/api/auth/sign-in/email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
            });
            if (!response.ok)
              throw new Error("Sign-in failed. Check your local account credentials.");
            await cache.invalidateQueries();
            router.push(loginReturn(new URLSearchParams(window.location.search).get("next")));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <Button variant="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
