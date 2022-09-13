import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { useUser } from "@supabase/auth-helpers-react";
import { AllotmentProps } from "allotment";
import { PaneProps } from "allotment/dist/types/src/allotment";
import { useRef, useState, ComponentType, useEffect, useMemo } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";
import { userState } from "../recoil/user.recoil";
import Game from "./game";
import Header from "./header/header";
import TitleBar from "./titleBar";

type Props = {
  colorScheme: string,
  children: JSX.Element,
};

export default function Main({colorScheme, children} : Props) {
  const {user, isLoading} = useUser();
  const [userMemo, setUserMemo] = useState({});
  const [isPageVisible] = useRecoilState(pageVisibiltyState);
  const setUserState = useSetRecoilState(userState);

  // #region User auth check and state store
  useMemo(() => {
    // reason for setTimeout: https://github.com/facebookexperimental/Recoil/issues/12
    setTimeout(async () => {
      if(!isLoading) {
        // crude way of checking to see if user cookie already exists
        const { data } = await supabaseClient.from('profiles').select('*').single();

        if(Object.keys(userMemo).length == 0 || !data) {
          // @ts-ignore
          setUserState(null);
        } else {
          // @ts-ignore
          setUserState(userMemo);
        }
      }
    }, 0);
  }, [JSON.stringify(userMemo)]);

  useEffect(() => {
    setUser();
  }, [user, isLoading]);

  const setUser = async () => {
    if(!isLoading) {
      if (!user) {
        // @ts-ignore
        setUserState(null);
      }
      else {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
        // @ts-ignore
        setUserState({id: user.id, username: profile.username, nickname: profile.nickname, avatar_url: (profile.avatar_url ? profile.avatar_url : '/default_profile.png')});
      }
    }
  };
  // #endregion

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
    return <div>Whirled is loading...</div>;
  }
  // #endregion
  
  return (
    <div className={'flex flex-col h-screen ' + colorScheme}>
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