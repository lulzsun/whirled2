import { useUser } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { pageVisibiltyState } from '../recoil/pageVisibility.recoil';

export default function App() {
  const router = useRouter();
  const {user, isLoading} = useUser();
  const [isLoggedIn, setLoggedIn] = useState(false);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

  useEffect(() => {
    authUser();
  }, [user])

  const authUser = () => {
    // wait until loading stopped
    if(!isLoading) {
      // if user does not exist, redirect to login page
      if (!user) {
        setLoggedIn(false);
        router.push('/login');
      }
      // else do logged in stuff
      else {
        if(!isLoggedIn) {
          setLoggedIn(true);
          console.log("you are now logged in");
          setIsPageVisible(false);
        }
        else {
          setIsPageVisible(false);
        }
      }
    }
  };

  return (
    <div>{"hi, you shouldn't be seeing this page"}</div>
  );
}
