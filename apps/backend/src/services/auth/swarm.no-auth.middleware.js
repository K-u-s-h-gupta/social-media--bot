import { __awaiter, __decorate } from "tslib";
/**
 * SwarmNoAuthMiddleware
 * Sets req.org to the default organization for no-auth swarm access.
 * Used when DISABLE_REGISTRATION=false and no JWT is provided.
 */
import { Injectable } from '@nestjs/common';
let SwarmNoAuthMiddleware = class SwarmNoAuthMiddleware {
    use(req, res, next) {
        return __awaiter(this, void 0, void 0, function* () {
            const orgId = process.env.SWARM_ORG_ID || '';
            // @ts-ignore
            req.org = { id: orgId };
            next();
        });
    }
};
SwarmNoAuthMiddleware = __decorate([
    Injectable()
], SwarmNoAuthMiddleware);
export { SwarmNoAuthMiddleware };
//# sourceMappingURL=swarm.no-auth.middleware.js.map