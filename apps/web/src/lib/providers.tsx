"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WebMCP } from "./webmcp";
import { ToastProvider } from "@/components/ui/toast";
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 1500, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <WebMCP />
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
