import { useUser } from "@supabase/auth-helpers-react";
import router from "next/router";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";

export default function Shop() {
  const { user, isLoading } = useUser();
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

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
    <div>hi from shop</div>
  );
}