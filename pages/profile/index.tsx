import { useUser } from "@supabase/auth-helpers-react";
import router from "next/router";
import { useContext, useEffect } from "react";

export default function Profile() {
  const { user, isLoading } = useUser();

  useEffect(() => {
    authUser();
  }, [])

  const authUser = () => {
    if(!isLoading) {
      if (user) {
        router.push(`/profile/${user?.user_metadata['username']}`);
      }
      else {
        router.push('/login');
      }
    }
  };
}