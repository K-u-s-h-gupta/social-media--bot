'use client';
import { __rest } from "tslib";
const SafeImage = (_a) => {
    var { src, alt, width, height, className, style } = _a, rest = __rest(_a, ["src", "alt", "width", "height", "className", "style"]);
    return (<img src={src} alt={(alt === null || alt === void 0 ? void 0 : alt.toString()) || ''} width={typeof width === 'number' ? width : undefined} height={typeof height === 'number' ? height : undefined} className={className} style={style}/>);
};
export default SafeImage;
//# sourceMappingURL=safe.image.js.map