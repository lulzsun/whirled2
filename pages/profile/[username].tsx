import { createClient } from "@supabase/supabase-js";
import { GetServerSidePropsContext } from "next";
import { useContext, useEffect, useState } from "react";
import { PagePaneContext } from "../_app";
import ErrorPage from 'next/error'
import ProfileCard from "../../components/profile/profileCard";
import ProfileCommentSection from "../../components/commentSection";

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
  const profile: Profile = pageData.profile;

  useEffect(() => {
    setIsPageVisible(true);
  }, []);

  if(!profile) {
    return <ErrorPage statusCode={404} />
  }
  
  return (<>
    <ProfileCard {...profile}/>
    <ProfileCommentSection {...profile}/>
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