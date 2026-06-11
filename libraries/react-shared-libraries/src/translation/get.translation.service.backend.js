import { __awaiter } from "tslib";
import i18next from './i18next';
import { fallbackLng } from './i18n.config';
export function getT(ns, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ns && !i18next.hasLoadedNamespace(ns)) {
            yield i18next.loadNamespaces(ns);
        }
        return i18next.getFixedT(i18next.resolvedLanguage || fallbackLng, Array.isArray(ns) ? ns[0] : ns, options === null || options === void 0 ? void 0 : options.keyPrefix);
    });
}
//# sourceMappingURL=get.translation.service.backend.js.map