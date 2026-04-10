import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const type = requestUrl.searchParams.get("type")?.toLowerCase() ?? "";

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    const needsSetup = data?.session?.user?.user_metadata?.needs_password_setup === true;

    if (type === "recovery" || type === "invite" || needsSetup) {
      return NextResponse.redirect(new URL("/definir-password", request.url));
    }
  }

  return NextResponse.redirect(new URL("/", request.url));
}
