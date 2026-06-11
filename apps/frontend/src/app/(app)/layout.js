import { __awaiter } from "tslib";
import { Plus_Jakarta_Sans } from 'next/font/google';
import clsx from 'clsx';
import { VariableContextComponent } from "../../../../../libraries/react-shared-libraries/src/helpers/variable.context";
import { FetchWrapperComponent } from "../../../../../libraries/helpers/src/utils/custom.fetch";
import { cookies } from 'next/headers';
import { cookieName, fallbackLng, } from "../../../../../libraries/react-shared-libraries/src/translation/i18n.config";
import { HtmlComponent } from "../../components/layout/html.component";
import Script from 'next/script';
import { ChangeDirClient } from "../../components/new-layout/change.dir.client";
export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';
const jakartaSans = Plus_Jakarta_Sans({
    weight: ['600', '500'],
    style: ['normal', 'italic'],
    subsets: ['latin'],
});
export default function AppLayout(_a) {
    return __awaiter(this, arguments, void 0, function* ({ children }) {
        var _b;
        const cookieStore = yield cookies();
        const language = ((_b = cookieStore.get(cookieName)) === null || _b === void 0 ? void 0 : _b.value) || fallbackLng;
        return (<html>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any"/>
        {!!process.env.DATAFAST_WEBSITE_ID && (<Script data-website-id={process.env.DATAFAST_WEBSITE_ID} data-domain="prospektlab.com" src="https://datafa.st/js/script.js" strategy="afterInteractive"/>)}
      </head>
      <ChangeDirClient />
      <body className={clsx(jakartaSans.className, 'dark text-primary !bg-primary')}>
        <VariableContextComponent storageProvider={process.env.STORAGE_PROVIDER} environment={process.env.NODE_ENV} backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL} plontoKey={process.env.NEXT_PUBLIC_POLOTNO} stripeClient={process.env.STRIPE_PUBLISHABLE_KEY} billingEnabled={!!process.env.STRIPE_PUBLISHABLE_KEY} discordUrl={process.env.NEXT_PUBLIC_DISCORD_SUPPORT} frontEndUrl={process.env.FRONTEND_URL} isGeneral={!!process.env.IS_GENERAL} genericOauth={!!process.env.POSTIZ_GENERIC_OAUTH} oauthLogoUrl={process.env.NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL} oauthDisplayName={process.env.NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME} uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY} cloudflareUrl={process.env.CLOUDFLARE_BUCKET_URL || ''} mainUrl={process.env.MAIN_URL || ''} mcpUrl={process.env.MCP_URL} dub={!!process.env.STRIPE_PUBLISHABLE_KEY} facebookPixel={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL} telegramBotName={process.env.TELEGRAM_BOT_NAME} neynarClientId={process.env.NEYNAR_CLIENT_ID} isSecured={!process.env.NOT_SECURED} disableImageCompression={!!process.env.DISABLE_IMAGE_COMPRESSION} disableXAnalytics={!!process.env.DISABLE_X_ANALYTICS} sentryDsn={process.env.NEXT_PUBLIC_SENTRY_DSN} extensionId={process.env.EXTENSION_ID || ''} googleAdsId={process.env.NEXT_PUBLIC_GTM_ID} googleAdsTrialTracking={process.env.NEXT_PUBLIC_TRACKING_TRIAL} language={language} transloadit={process.env.TRANSLOADIT_AUTH && process.env.TRANSLOADIT_TEMPLATE
                ? [
                    process.env.TRANSLOADIT_AUTH,
                    process.env.TRANSLOADIT_TEMPLATE,
                ]
                : []}>
          <HtmlComponent />
          <FetchWrapperComponent baseUrl={process.env.NEXT_PUBLIC_BACKEND_URL}>
            {children}
          </FetchWrapperComponent>
        </VariableContextComponent>
      </body>
    </html>);
    });
}
//# sourceMappingURL=layout.js.map