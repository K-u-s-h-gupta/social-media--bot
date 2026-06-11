import { __awaiter } from "tslib";
import { cookies } from 'next/headers';
import { customFetch } from "./custom.fetch.func";
export const internalFetch = (url_1, ...args_1) => __awaiter(void 0, [url_1, ...args_1], void 0, function* (url, options = {}) {
    var _a, _b;
    const cookieStore = yield cookies();
    return customFetch({ baseUrl: process.env.BACKEND_INTERNAL_URL }, (_a = cookieStore === null || cookieStore === void 0 ? void 0 : cookieStore.get('auth')) === null || _a === void 0 ? void 0 : _a.value, (_b = cookieStore === null || cookieStore === void 0 ? void 0 : cookieStore.get('showorg')) === null || _b === void 0 ? void 0 : _b.value)(url, options);
});
//# sourceMappingURL=internal.fetch.js.map