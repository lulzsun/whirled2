import '../styles/globals.css'
import { AppProps } from 'next/app';
import Head from 'next/head';
import { createEmotionCache, MantineProvider } from '@mantine/core';
import { AllotmentProps } from "allotment";
import "allotment/dist/style.css";
import Game from '../components/game';
import { ComponentType, createContext, Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { PaneProps } from 'allotment/dist/types/src/allotment';
import Header from '../components/header';
import { UserProvider } from '@supabase/auth-helpers-react';
import { supabaseClient } from '@supabase/auth-helpers-nextjs';

interface PagePaneContext {
  isPageVisible: boolean,
  setIsPageVisible: Dispatch<SetStateAction<boolean>>
}

export const PagePaneContext = createContext<PagePaneContext>({} as PagePaneContext);

export default function App(props: AppProps) {
  const { Component, pageProps } = props;
  const [isPageVisible, setIsPageVisible] = useState(false);
  const emotionCache = createEmotionCache({ key: 'mantine', prepend: false }); // fixes tailwind

  // https://github.com/johnwalley/allotment/issues/81
  // all this below can be wrapped into useAllotment hook or smth like that
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
    return <div>loading...</div>;
  }
  // end of hook

  return (
    <>
      <Head>
        <title>Hello Whirled</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>

      <PagePaneContext.Provider value={{isPageVisible, setIsPageVisible}}>
      <UserProvider supabaseClient={supabaseClient}>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        emotionCache={emotionCache}
        theme={{
          /** Put your mantine theme override here */
          colorScheme: 'dark',
        }}
      >
        <div className='flex flex-col h-screen'>
          <Header/>
          <div className='w-full h-full'>
            <Allotment>
              <Allotment.Pane minSize={0}>
                <Game/>
              </Allotment.Pane>
              <Allotment.Pane minSize={500} visible={isPageVisible}>
                <div className='w-full h-full overflow-y-auto'>
                  <Component {...pageProps} />
                </div>
              </Allotment.Pane>
            </Allotment>
          </div>
        </div>
      </MantineProvider>
      </UserProvider>
      </PagePaneContext.Provider>
    </>
  );
}