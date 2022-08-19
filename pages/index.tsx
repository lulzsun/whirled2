import { useUser } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function App() {
  const router = useRouter();
  const {user, isLoading} = useUser();
  const [isLoggedIn, setLoggedIn] = useState(false);

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
        if(!isLoggedIn) setLoggedIn(true);
        else {
          console.log("you are logged in");
        }
      }
    }
  };

  return (
    <div>{"hi, you shouldn't be seeing this page"}</div>
  );
}
