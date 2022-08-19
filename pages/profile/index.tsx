import { useUser } from "@supabase/auth-helpers-react";
import { useRouter } from "next/router";
import { useContext, useEffect } from "react";

export default function Profile() {
  const router = useRouter();
  const { user, isLoading } = useUser();

  useEffect(() => {
    authUser();
  }, [user])

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