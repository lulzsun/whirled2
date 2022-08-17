import { useUser } from "@supabase/auth-helpers-react";
import router from "next/router";
import { useContext, useEffect } from "react";
import { PagePaneContext } from "./_app";

export default function Stuff() {
  const { user, isLoading } = useUser();
  const {isPageVisible, setIsPageVisible} = useContext(PagePaneContext);

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
    <div>hi from stuff</div>
  );
}