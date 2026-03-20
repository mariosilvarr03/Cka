"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function InviteAcceptHandler() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash || !hash.includes("access_token=")) {
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) {
      setError("Convite invalido. Pede um novo convite ao administrador.");
      return;
    }

    const supabase = createClient();

    void (async () => {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        setError("Nao foi possivel validar o convite. Pede um novo convite.");
        return;
      }

      if (type === "invite" || type === "recovery") {
        router.replace("/definir-password");
        return;
      }

      router.replace("/");
    })();
  }, [router]);

  if (!error) {
    return null;
  }

  return (
    <p className="mb-4 rounded-lg border border-danger/20 bg-red-50 p-3 text-sm text-danger">
      {error}
    </p>
  );
}

