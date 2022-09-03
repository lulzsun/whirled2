import router from "next/router";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { userState } from "../../recoil/user.recoil";

export default function Profile() {
  const [user] = useRecoilState(userState);

  useEffect(() => {
    if (user) {
      router.push(`/profile/${user.username}`);
    }
    else {
      router.push('/login');
    }
  }, [user]);
}