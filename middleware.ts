import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Cache static assets (images, textures, models)
  if (request.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|glb|fbx|exr|hdr)$/)) {
    // Set cache headers for 1 year (immutable assets)
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  // Cache texture thumbnails
  if (request.nextUrl.pathname.startsWith('/thumbnails/')) {
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  // Cache API responses for texture generation
  if (request.nextUrl.pathname.startsWith('/api/generate-texture')) {
    response.headers.set('Cache-Control', 'private, max-age=3600')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}