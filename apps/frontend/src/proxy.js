import { __awaiter } from "tslib";
import { NextResponse } from 'next/server';
import { getCookieUrlFromDomain } from "../../../libraries/helpers/src/subdomain/subdomain.management";
export function proxy(request) {
    return __awaiter(this, void 0, void 0, function* () {
        const nextUrl = request.nextUrl;
        const authCookie = request.cookies.get('auth') ||
            request.headers.get('auth') ||
            nextUrl.searchParams.get('loggedAuth');
        if (nextUrl.pathname.startsWith('/swarm') ||
            nextUrl.pathname === '/') {
            return NextResponse.next({
                request: {
                    headers: new Headers(request.headers),
                },
            });
        }
        if (nextUrl.href.indexOf('/auth/logout') > -1) {
            const response = NextResponse.redirect(new URL('/auth/login', nextUrl.href));
            response.cookies.set('auth', '', Object.assign(Object.assign({ path: '/' }, (!process.env.NOT_SECURED
                ? {
                    secure: true,
                    httpOnly: true,
                    sameSite: false,
                }
                : {})), { maxAge: -1, domain: getCookieUrlFromDomain(process.env.FRONTEND_URL) }));
            return response;
        }
        if (nextUrl.pathname.startsWith('/auth/register') &&
            process.env.DISABLE_REGISTRATION === 'true') {
            return NextResponse.redirect(new URL('/auth/login', nextUrl.href));
        }
        const org = nextUrl.searchParams.get('org');
        if (!nextUrl.pathname.startsWith('/auth') && !authCookie) {
            const providers = ['google', 'settings'];
            const findIndex = providers.find((p) => nextUrl.href.indexOf(p) > -1);
            const additional = !findIndex
                ? ''
                : (nextUrl.href.indexOf('?') > -1 ? '&' : '?') +
                    `provider=${(findIndex === 'settings'
                        ? process.env.POSTIZ_GENERIC_OAUTH
                            ? 'generic'
                            : 'github'
                        : findIndex).toUpperCase()}`;
            return NextResponse.redirect(new URL(`/auth${additional}`, nextUrl.href));
        }
        if (nextUrl.pathname.startsWith('/auth') && authCookie) {
            return NextResponse.redirect(new URL(`/`, nextUrl.href));
        }
        if (nextUrl.pathname.startsWith('/auth') && !authCookie) {
            if (org) {
                const redirect = NextResponse.redirect(new URL(`/`, nextUrl.href));
                redirect.cookies.set('org', org, Object.assign(Object.assign({}, (!process.env.NOT_SECURED
                    ? {
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        sameSite: false,
                        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL),
                    }
                    : {})), { expires: new Date(Date.now() + 15 * 60 * 1000) }));
                return redirect;
            }
            return NextResponse.next({
                request: {
                    headers: new Headers(request.headers),
                },
            });
        }
        try {
            if (org) {
                const { internalFetch } = yield import('@gitroom/helpers/utils/internal.fetch');
                const { id } = yield (yield internalFetch('/user/join-org', {
                    body: JSON.stringify({ org }),
                    method: 'POST',
                })).json();
                const redirect = NextResponse.redirect(new URL(`/?added=true`, nextUrl.href));
                if (id) {
                    redirect.cookies.set('showorg', id, Object.assign(Object.assign({}, (!process.env.NOT_SECURED
                        ? {
                            path: '/',
                            secure: true,
                            httpOnly: true,
                            sameSite: false,
                            domain: getCookieUrlFromDomain(process.env.FRONTEND_URL),
                        }
                        : {})), { expires: new Date(Date.now() + 15 * 60 * 1000) }));
                }
                return redirect;
            }
            if (nextUrl.pathname === '/') {
                return NextResponse.redirect(new URL('/swarm', nextUrl.href));
            }
            return NextResponse.next({
                request: {
                    headers: new Headers(request.headers),
                },
            });
        }
        catch (err) {
            console.log('err', err);
            return NextResponse.redirect(new URL('/auth/logout', nextUrl.href));
        }
    });
}
export const config = {
    matcher: '/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
};
//# sourceMappingURL=proxy.js.map