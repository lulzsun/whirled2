import '../styles/globals.css'
import { AppProps } from 'next/app';
import Head from 'next/head';
import { createEmotionCache, MantineProvider } from '@mantine/core';
import "allotment/dist/style.css";
import Main from '../components/main';
import { RecoilRoot } from 'recoil';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider, Session } from '@supabase/auth-helpers-react';
import { useState } from 'react';

export default function App({
  Component,
  pageProps,
}: AppProps<{
  initialSession: Session
}>) {
  const emotionCache = createEmotionCache({ key: 'mantine', prepend: false }); // fixes tailwind
  // Create a new supabase browser client on every first render.
  const [supabaseClient] = useState(() => createBrowserSupabaseClient())

  return (
    <>
      <Head>
        <title>Hello Whirled</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>
      
      <RecoilRoot>
      <SessionContextProvider
        supabaseClient={supabaseClient}
        initialSession={pageProps.initialSession}
      >
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        emotionCache={emotionCache}
        theme={{
          /** Put your mantine theme override here */
          colorScheme: 'dark',
        }}
      >
        <Main colorScheme={'dark'}>
          <Component {...pageProps} />
        </Main>
      </MantineProvider>
      </SessionContextProvider>
      </RecoilRoot>
    </>
  );
}