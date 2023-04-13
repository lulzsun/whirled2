import { useRecoilValue } from "recoil";
import ProfileCard, { Profile } from "../../components/profile/ProfileCard";
import { pocketBaseState } from "../../recoil/pocketBase.recoil";
import { useEffect, useState } from "react";

interface Props {
  username: string
}

export function Page({username}: Props) {
  const {pb} = useRecoilValue(pocketBaseState);
  const [profile, setProfile] = useState<Profile>({} as Profile);

  useEffect(() => {
    pb.collection("profiles").getFirstListItem(`username="lulzsun"`)
    .then(e => {
      let profile = (e as unknown as Profile);
      setProfile(profile);
    })
    .catch(e => console.error(e));
  }, [])

  return <>
    <ProfileCard profile={profile}/>
    {/* <ProfileCommentSection {...{ profile, user }}/> */}
  </>
}

export async function onBeforeRender(pageContext: { routeParams: { username: string; }; }) {
  // The route parameter of `/profile/@username` is available at `pageContext.routeParams`
  const { username } = pageContext.routeParams;

  // We make `pageProps` available as `pageContext.pageProps`
  return {
    pageContext: { pageProps: { username } }
  };
}

// By default `pageContext` is available only on the server. But our hydrate function
// we defined earlier runs in the browser and needs `pageContext.pageProps`; we use
// `passToClient` to tell `vite-plugin-ssr` to serialize and make `pageContext.pageProps`
// available to the browser.
export const passToClient = ["pageProps"];