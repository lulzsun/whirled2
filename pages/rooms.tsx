import router from "next/router";
import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";
import { userState } from "../recoil/user.recoil";

export default function Rooms() {
  const [user] = useRecoilState(userState);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

  useEffect(() => {
    if (user) {
      setIsPageVisible(true);
    }
    else {
      router.push('/login');
    }
  }, [user]);

  return (
    <div>hi from rooms</div>
  );
}