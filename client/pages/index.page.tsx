import { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { navigate } from 'vite-plugin-ssr/client/router';
import { pageVisibiltyState } from '../recoil/pageVisibility.recoil';
import { pocketBaseState } from '../recoil/pocketBase.recoil';

Page.metaData = {
  title: 'Hello, Whirled!',
  description: "The brave new whirled..."
}

export function Page() {
  const setIsPageVisible = useSetRecoilState(pageVisibiltyState);
  const {pb} = useRecoilValue(pocketBaseState);
  
  useEffect(() => {
    if (pb.authStore.isValid) {
      setIsPageVisible(false);
    }
    else {
      setIsPageVisible(true);
      navigate('/login');
    }
  }, [])

  return (
    <div></div>
  )
}