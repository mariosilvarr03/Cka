"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function InviteAcceptHandler() {
  const router = useRouter();

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
      router.replace("/login?error=Convite+invalido.+Pede+um+novo+convite+ao+administrador.");
      return;
    }

    const supabase = createClient();

    void (async () => {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        router.replace("/login?error=Nao+foi+possivel+validar+o+convite.+Pede+um+novo+convite.");
        return;
      }

      if (type === "invite" || type === "recovery") {
        router.replace("/definir-password");
        return;
      }

      router.replace("/");
    })();
  }, [router]);

  return null;
}
