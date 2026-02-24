import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path === "/login";
  const isShare = path === "/share";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isPublic) {
    const url = request.nextUrl.clone();
    const configEmail = (process.env.READ_ONLY_MONITOR_EMAIL ?? "").trim().toLowerCase();
    const userEmail = (user.email ?? "").trim().toLowerCase();
    url.pathname = configEmail && userEmail === configEmail ? "/share" : "/home";
    return NextResponse.redirect(url);
  }

  const configEmail = (process.env.READ_ONLY_MONITOR_EMAIL ?? "").trim().toLowerCase();
  const userEmail = (user?.email ?? "").trim().toLowerCase();
  const isReadOnlyUser = !!configEmail && userEmail === configEmail;
  if (isReadOnlyUser && !isPublic && !isShare) {
    const url = request.nextUrl.clone();
    url.pathname = "/share";
    return NextResponse.redirect(url);
  }

  return response;
}
