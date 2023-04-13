import { useRecoilValue } from "recoil";
import { pocketBaseState } from "../../recoil/pocketBase.recoil";
import { navigate } from 'vite-plugin-ssr/client/router';
import { useEffect } from "react";

export function Page() {
  const {user} = useRecoilValue(pocketBaseState);

  useEffect(() => {
    if (user) {
      navigate(`/profile/${user.username}`)
    }
    else {
      navigate('/login');
    }
  }, [user]);

  return <>
  </>
}