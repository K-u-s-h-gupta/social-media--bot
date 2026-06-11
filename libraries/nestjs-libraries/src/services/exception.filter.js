import { __decorate } from "tslib";
import { Catch, HttpException, } from '@nestjs/common';
export class HttpForbiddenException extends HttpException {
    constructor() {
        super('Forbidden', 403);
    }
}
let HttpExceptionFilter = class HttpExceptionFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        return response.status(401).send();
    }
};
HttpExceptionFilter = __decorate([
    Catch(HttpForbiddenException)
], HttpExceptionFilter);
export { HttpExceptionFilter };
//# sourceMappingURL=exception.filter.js.map