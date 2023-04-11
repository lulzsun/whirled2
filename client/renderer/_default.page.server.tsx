import ReactDOMServer from 'react-dom/server'
import { escapeInject, dangerouslySkipEscape } from 'vite-plugin-ssr/server'
import type { PageContextServer } from './types'
import PageShell from '../components/PageShell'
import React from 'react'
import { MantineProvider } from '@mantine/core'
import { RecoilRoot } from 'recoil'
import RecoilNexus from 'recoil-nexus'

export { render }
export { passToClient }

const passToClient = ['pageProps']

async function render(pageContext: PageContextServer) {
  const { Page, pageProps } = pageContext;
  // this metaData export is a hack to fix react hmr fast refresh, see links for more information
  // - https://github.com/vitejs/vite/discussions/4583
  // - https://github.com/remcohaszing/remark-mdx-frontmatter/issues/9
  const { metaData } = Page; 
  const title = (metaData && metaData.title) || "Hello, Whirled"
  const description = (metaData && metaData.description) || "Hello, Whirled"

  const pageHtml = ReactDOMServer.renderToString(
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

  return escapeInject`<!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <meta name="description" content="${description}"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      </head>
      <body>
        <div id="root">${dangerouslySkipEscape(pageHtml)}</div>
      </body>
    </html>`;
}