import { AllotmentProps } from "allotment";
import { PaneProps } from "allotment/dist/types/src/allotment";
import { useRef, useState, ComponentType, useEffect } from "react";
import { MantineProvider, createEmotionCache } from "@mantine/core";

import '../index.css';
import "allotment/dist/style.css";
import Header from "./Header";
import Game from "./Game";
import TitleBar from "./TitleBar";
import { RecoilRoot } from "recoil";
import React from "react";

interface Props {
  children: React.ReactNode
}

export const PageShell: React.FC<Props> = ({children}) => {  
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
      <RecoilRoot>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{
          /** Put your mantine theme override here */
          colorScheme: 'dark',
        }}
      >
        <noscript>{children}</noscript>
      </MantineProvider>
      </RecoilRoot>
    </>;
  }
  
  return (
    <React.StrictMode>
    <RecoilRoot>
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        /** Put your mantine theme override here */
        colorScheme: 'dark',
      }}
    >
      <div className={'flex flex-col h-screen dark'}>
        <Header/>
        <div className='w-full h-full'>
          <Allotment>
            <Allotment.Pane minSize={0}>
              <Game/>
            </Allotment.Pane>
            <Allotment.Pane minSize={500} visible={true}>
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
    </MantineProvider>
    </RecoilRoot>
    </React.StrictMode>
  )
}

export default PageShell;