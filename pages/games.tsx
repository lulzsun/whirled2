import { useUser } from "@supabase/auth-helpers-react";
import router from "next/router";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { pageVisibilty } from "../recoil/pageVisibility.recoil";

export default function Games() {
  const { user, isLoading } = useUser();
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibilty);

  useEffect(() => {
    if(!isLoading) {
      if (user) {
        setIsPageVisible(true);
      }
      else {
        router.push('/login');
      }
    }
  }, [isLoading, user]);

  return (
    <div>hi from games</div>
  );
}