import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { pageVisibiltyState } from '../recoil/pageVisibility.recoil';
import { userState } from '../recoil/user.recoil';

export default function App() {
  const router = useRouter();
  const [user] = useRecoilState(userState);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

  useEffect(() => {
    if (!user) {
      router.push('/login');
    }
    else {
      setIsPageVisible(false);
    }
  }, [user])

  return (
    <div>{"hi, you shouldn't be seeing this page"}</div>
  );
}
