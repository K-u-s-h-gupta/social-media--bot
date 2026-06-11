'use client';
import { DecisionEverywhere, ModalManager, } from '@gitroom/frontend/components/layout/new-modal';
export const MantineWrapper = (props) => {
    return (<ModalManager>
      <DecisionEverywhere />
      {props.children}
    </ModalManager>);
};
//# sourceMappingURL=mantine.wrapper.js.map