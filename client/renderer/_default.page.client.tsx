import ReactDOM from 'react-dom/client'
import { PageContextClient } from './types'
import PageShell from '../components/PageShell'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import { RecoilRoot } from 'recoil'
import RecoilNexus from 'recoil-nexus'

export { render }

export const clientRouting = true
export const prefetchStaticAssets = { when: 'VIEWPORT' }
export const hydrationCanBeAborted = true

let root: ReactDOM.Root
async function render(pageContext: PageContextClient) {
  const { Page, pageProps } = pageContext
  const page = (
    <React.StrictMode>
    <RecoilRoot>
    <RecoilNexus />
    <MantineProvider
      withGlobalStyles
      withNormalizeCSS
      theme={{
        /** Put your mantine theme override here */
        colorScheme: 'dark',
      }}
    >
    <PageShell>
      <Page {...pageProps} />
    </PageShell>
    </MantineProvider>
    </RecoilRoot>
    </React.StrictMode>
  )
  const container = document.getElementById('root')!
  if (pageContext.isHydration) {
    root = ReactDOM.hydrateRoot(container, page)
  } else {
    if (!root) {
      root = ReactDOM.createRoot(container)
    }
    root.render(page)
  }
}