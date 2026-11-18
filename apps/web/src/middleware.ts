import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@finvault/db-types';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Never intercept internal Next.js assets, API routes, or static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const isAuthRoute = pathname.startsWith('/auth') || pathname === '/login';
  const isDemoMode = request.cookies.get('finvault-demo')?.value === 'true';

  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon-key',
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    const isAuthenticated = (!!user && !error) || isDemoMode;

    // Guard protected routes (redirect to /login if unauthenticated)
    if (!isAuthenticated && !isAuthRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Redirect authenticated user away from login page
    if (isAuthenticated && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    // Fail safe to /login on unhandled error if route is protected
    if (!isDemoMode && !isAuthRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
