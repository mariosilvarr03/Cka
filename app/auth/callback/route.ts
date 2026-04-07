import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type")?.toLowerCase() ?? "";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    if (type === "recovery" || type === "invite") {
      return NextResponse.redirect(new URL("/definir-password", request.url));
    }
  }

  return NextResponse.redirect(new URL("/", request.url));
}
