'use client';
import { __rest } from "tslib";
import { useEffect, useRef, useState, } from 'react';
import { clsx } from 'clsx';
const ReactLoading = ({ color = '#fff', width = 20, height = 20 }) => {
    const size = Math.min(width, height);
    const borderWidth = Math.max(2, Math.round(size / 8));
    return (<div style={{
            width: size,
            height: size,
            border: `${borderWidth}px solid transparent`,
            borderTopColor: color,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }}/>);
};
export const Button = (_a) => {
    var { children, loading, innerClassName, secondary } = _a, props = __rest(_a, ["children", "loading", "innerClassName", "secondary"]);
    const ref = useRef(null);
    const [height, setHeight] = useState(null);
    useEffect(() => {
        var _a;
        setHeight(((_a = ref.current) === null || _a === void 0 ? void 0 : _a.offsetHeight) || 40);
    }, []);
    return (<button {...props} type={props.type || 'button'} ref={ref} className={clsx((props.disabled || loading) && 'opacity-50 pointer-events-none', `${secondary ? 'bg-third' : 'bg-forth text-white'} px-[24px] h-[40px] cursor-pointer items-center justify-center flex relative`, props === null || props === void 0 ? void 0 : props.className)}>
      {loading && (<div className="absolute inset-0 flex items-center justify-center">
          <ReactLoading type="spin" color="#fff" width={height / 2} height={height / 2}/>
        </div>)}
      <div className={clsx(innerClassName, 'flex-1 items-center justify-center flex', loading && 'invisible')}>
        {children}
      </div>
    </button>);
};
//# sourceMappingURL=button.js.map