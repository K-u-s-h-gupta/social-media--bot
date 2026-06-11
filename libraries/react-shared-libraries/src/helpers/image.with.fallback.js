import { __rest } from "tslib";
import { useEffect, useState } from 'react';
import SafeImage from './safe.image';
const ImageWithFallback = (props) => {
    const { src, fallbackSrc } = props, rest = __rest(props, ["src", "fallbackSrc"]);
    const [imgSrc, setImgSrc] = useState(src);
    useEffect(() => {
        if (src !== imgSrc) {
            setImgSrc(src);
        }
    }, [src]);
    return (<SafeImage alt="" {...rest} src={imgSrc} onError={() => {
            setImgSrc(fallbackSrc);
        }}/>);
};
export default ImageWithFallback;
//# sourceMappingURL=image.with.fallback.js.map