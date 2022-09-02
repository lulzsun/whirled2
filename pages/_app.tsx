import '../styles/globals.css'
import { AppProps } from 'next/app';
import Head from 'next/head';
import { createEmotionCache, MantineProvider } from '@mantine/core';
import { AllotmentProps } from "allotment";
import "allotment/dist/style.css";
import { ComponentType, createContext, Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { PaneProps } from 'allotment/dist/types/src/allotment';
import Main from '../components/main';
import { UserProvider } from '@supabase/auth-helpers-react';
import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import { RecoilRoot, useRecoilState } from 'recoil';
import { pageVisibilty } from '../recoil/pageVisibility.recoil';

export default function App(props: AppProps) {
  const { Component, pageProps } = props;
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
      
      <RecoilRoot>
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
        <Main>
          <Component {...pageProps} />
        </Main>
      </MantineProvider>
      </UserProvider>
      </RecoilRoot>
    </>
  );
}