import { AllotmentProps } from "allotment";
import { PaneProps } from "allotment/dist/types/src/allotment";
import { useRef, useState, ComponentType, useEffect } from "react";

import '../index.css';
import "allotment/dist/style.css";
import Header from "./Header";
import Game from "./Game";
import TitleBar from "./TitleBar";

import React from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";

interface Props {
  children: React.ReactNode
}

export const PageShell: React.FC<Props> = ({children}) => {  
  const [isPageVisible] = useRecoilState(pageVisibiltyState);
  const isMountedRef = useRef(false);
  const [Allotment, setAllotment] = useState<
    (ComponentType<AllotmentProps> & { Pane: ComponentType<PaneProps> }) | null
  >(null);

  useEffect(() => {
    isMountedRef.current = true;
    import("allotment").then((mod) => {
      if (!isMountedRef.current) {
        return;
      }
      setAllotment(mod.Allotment);
    }).catch((err) =>
      console.error(err, `could not import allotment ${err.message}`)
    );
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!Allotment) {
    return <>
      <span>Whirled is loading...</span>
      <noscript>{children}</noscript>
    </>;
  }
  
  return (
    <div className={'flex flex-col h-screen dark'}>
      <Header/>
      <div className='w-full h-full'>
        <Allotment>
          <Allotment.Pane minSize={0}>
            <Game/>
          </Allotment.Pane>
          <Allotment.Pane minSize={500} visible={isPageVisible}>
            <div className="flex flex-col h-full">
              <TitleBar/>
              <div className='flex-1 w-full h-full overflow-y-auto'>
                {children}
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  )
}

export default PageShell;