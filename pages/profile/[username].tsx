import { createClient } from "@supabase/supabase-js";
import { GetServerSidePropsContext } from "next";
import { useContext, useEffect } from "react";
import { PagePaneContext } from "../_app";
import ErrorPage from 'next/error'
import ProfileCard from "../../components/profile/profileCard";
import ProfileComments from "../../components/comments";
import CommentEditor from "../../components/commentEditor";

interface PageProps {
  pageData: {
    profile: Profile;
    errors?: string;
  };
}

export type Profile = {
  id: string;
  nickname: string;
  username: string;
  avatar_url: string;
  birthday?: string;
}

export default function Id({ pageData }: PageProps) {
  const {isPageVisible, setIsPageVisible} = useContext(PagePaneContext);

  useEffect(() => {
    setIsPageVisible(true);
  }, []);

  const profile: Profile = pageData.profile;

  if(!profile) {
    return <ErrorPage statusCode={404} />
  }
  
  return (<>
    <ProfileCard {...profile}/>
    <div className="flex flex-col space-y-4 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
      <CommentEditor/>
      <ProfileComments id={profile.id}/>
    </div>
  </>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  try {
    // Create a client with service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const username = context.params?.username;
    // Run queries with service role (bypasses RLS) on the server and
    // find row matching our page's username
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('username', username).single();
    if(profile == null) return { props: { pageData: {error: "Profile does not exist" }} }

    // By returning { props: pageData: {profile} }, the StaticPropsDetail component
    // will receive `pageData` as a prop at build time
    return { props: { pageData: {profile} } }
  } catch (err: any) {
    return { props: { pageData: {error: err.message }} }
  }
};