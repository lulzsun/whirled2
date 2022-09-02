import '../styles/globals.css'
import { AppProps } from 'next/app';
import Head from 'next/head';
import { createEmotionCache, MantineProvider } from '@mantine/core';
import "allotment/dist/style.css";
import Main from '../components/main';
import { UserProvider } from '@supabase/auth-helpers-react';
import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import { RecoilRoot } from 'recoil';

export default function App(props: AppProps) {
  const { Component, pageProps } = props;
  const emotionCache = createEmotionCache({ key: 'mantine', prepend: false }); // fixes tailwind

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