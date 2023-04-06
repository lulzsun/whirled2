import ReactDOM from 'react-dom/client'
import { PageContextClient } from './types'
import PageShell from '../components/PageShell'

export { render }

export const clientRouting = true
export const prefetchStaticAssets = { when: 'VIEWPORT' }
export const hydrationCanBeAborted = true

let root: ReactDOM.Root
async function render(pageContext: PageContextClient) {
  const { Page, pageProps } = pageContext
  const page = (
    <PageShell>
      <Page {...pageProps} />
    </PageShell>
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