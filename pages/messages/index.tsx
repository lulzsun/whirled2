import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../../recoil/pageVisibility.recoil";
import { userState } from "../../recoil/user.recoil";
import { Anchor, Checkbox, Image, Pagination } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import Link from "next/link";
dayjs.extend(relativeTime);

interface Message {
  id: number,
  content: string,
  content_sender: string,
  created_at: Date,
  sender: string,
  sender_avatar: string | null,
  sender_nick: string,
  title: string,
  selected?: boolean,
}

export default function Messages() {
  const router = useRouter();
  const isInitialMount = useRef(true);
  const [user] = useRecoilState(userState);
  const [activePage, setPage] = useState(0);
  const [maxPages, setMaxPages] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

  useEffect(() => {
    if (user) {
      setIsPageVisible(true);
      if(user.id) {
        let page = (router.query["page"] ? parseInt(router.query["page"][0]) : 1);
        setPage(page);
      }
    }
    else {
      router.push('/login');
    }
  }, [user, router.query["page"]]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      getMessagesFromSupa(activePage);
    }
  }, [activePage]);

  async function getMessagesFromSupa(page: number=1, limit: number=10) {
    if(page < 1) page = 1;
    
    const { data: sqlMessages } = await supabaseClient.rpc('get_messages', {
      'msg_limit': limit, 'msg_offset': (page-1)*limit
    });
    if(sqlMessages && sqlMessages.length > 0) {
      setMessages(sqlMessages);
      setMaxPages(Math.ceil(sqlMessages[0].full_count / limit));
    }
  }

  return (<>
    <Head>
      <title>Messages</title>
    </Head>
    <div>
      <div className="flex border border-gray-900 dark:border-white shadow-lg rounded-3xl p-4 m-4 whitespace-nowrap">
        <Checkbox label="Select All"/>
        {maxPages > 1 && <div className="flex flex-col w-full items-end">
          <Pagination page={activePage} total={maxPages} siblings={0} initialPage={1} 
            onChange={(index) => {
              setPage(index);
              router.push({
                pathname: '/messages',
                query: { page: index }
              }, undefined, { shallow: true }
              );
            }}/>
        </div>}
      </div>
      {messages.map((message) => {
        return (
          <div key={message.id}
          className="flex space-x-4 border border-gray-900 dark:border-white shadow-lg rounded-xl p-4 m-4 cursor-pointer"
          onClick={() => {router.push(`/messages/${message.id}`)}}>
            <div className="flex space-x-4 w-full">
              <Checkbox onClick={(event) => {event.stopPropagation();}}/>
              <div>
                <Image width={64} alt="profile picture" radius="md"
                  src={(message.sender_avatar == null ? '/default_profile.png' : message.sender_avatar)}/>
              </div>
              <div className="text-sm w-full truncate">
                <div className="flex flex-row w-full whitespace-nowrap">
                  <span className="font-semibold">{message.sender_nick}</span>
                  <div className="pl-1 text-xs">
                    <Link passHref href={{
                      pathname: `/profile/[username]`,
                      query: {
                        username: message.sender,
                      },
                    }}><Anchor component="a" onClick={(event) => {event.stopPropagation();}}>@{message.sender}</Anchor></Link>
                  </div>
                  <span className="w-full text-right">{dayjs().to(dayjs(message.created_at))}</span>
                </div>
                <span className="font-bold">
                  {message.title}
                </span>
                <br/>
                <span className="text-xs">
                  {message.content}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </>
  );
}