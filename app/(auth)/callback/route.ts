import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const redirectUrl = new URL('/auth/callback', request.url);

  request.nextUrl.searchParams.forEach((value, key) => {
    redirectUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(redirectUrl);
}
