import { useEffect } from 'react';
import { pageVisibiltyState } from '../recoil/pageVisibility.recoil';
import { useRecoilState } from 'recoil';
import { navigate } from 'vite-plugin-ssr/client/router';

Page.metaData = {
  title: 'Hello, Whirled!',
  description: "The brave new whirled..."
}

export function Page() {
  // const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);
  
  useEffect(() => {
    navigate('/login');
  }, [])

  return (
    <div>{"hi, you shouldn't be seeing this page"}</div>
  )
}