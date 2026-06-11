import { clsx } from 'clsx';
import { hasExtension } from "../../../helpers/src/utils/has.extension";
export const VideoOrImage = (props) => {
    const { src, autoplay, isContain, imageClassName, videoClassName } = props;
    if (hasExtension(src, 'mp4')) {
        return (<video src={src} autoPlay={autoplay} className={clsx('w-full h-full', videoClassName)} muted={true} loop={true}/>);
    }
    return (<img className={clsx(isContain ? 'object-contain' : 'object-cover', 'w-full h-full', imageClassName)} src={src}/>);
};
//# sourceMappingURL=video.or.image.js.map