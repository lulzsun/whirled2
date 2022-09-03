import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { useUser } from "@supabase/auth-helpers-react";
import { AllotmentProps } from "allotment";
import { PaneProps } from "allotment/dist/types/src/allotment";
import { useRef, useState, ComponentType, useEffect } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";
import { userState } from "../recoil/user.recoil";
import Game from "./game";
import Header from "./header";
import TitleBar from "./titleBar";

type Props = {
  children: JSX.Element,
};

export default function Main({children} : Props) {
  const {user, isLoading} = useUser();
  const [isLoggedIn, setLoggedIn] = useState(true);
  const [isPageVisible] = useRecoilState(pageVisibiltyState);
  const setUserState = useSetRecoilState(userState);

  useEffect(() => {
    setUser();
  }, [isLoading, user]);

  const setUser = async () => {
    if(!isLoading) {
      if (!user) {
        setLoggedIn(false);
        // @ts-ignore
        setUserState(null);
      }
      else {
        if(!isLoggedIn) setLoggedIn(true);
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        setUserState({id: user.id, username: profile.username, nickname: profile.nickname});
      }
    }
  };

  // #region https://github.com/johnwalley/allotment/issues/81
  // all this below can be wrapped into useAllotment hook or smth like that
  const isMountedRef = useRef(false);
  const [Allotment, setAllotment] = useState<
    (ComponentType<AllotmentProps> & { Pane: ComponentType<PaneProps> }) | null
  >(null);

  useEffect(() => {
    isMountedRef.current = true;
    import("allotment").then((mod) => {
      if (!isMountedRef.current) {
        return;
      }
      setAllotment(mod.Allotment);
    }).catch((err) =>
      console.error(err, `could not import allotment ${err.message}`)
    );
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!Allotment) {
    return <div>loading...</div>;
  }
  // #endregion
  
  return (
    <div className='flex flex-col h-screen'>
      <Header/>
      <div className='w-full h-full'>
        <Allotment>
          <Allotment.Pane minSize={0}>
            <Game/>
          </Allotment.Pane>
          <Allotment.Pane minSize={500} visible={isPageVisible}>
            <div className="flex flex-col h-full">
              <TitleBar/>
              <div className='flex-1 w-full h-full overflow-y-auto'>
                {children}
              </div>
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}