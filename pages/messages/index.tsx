import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../../recoil/pageVisibility.recoil";
import { userState } from "../../recoil/user.recoil";
import { Checkbox, Modal, Pagination } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import Messages from "../../components/messages/messages";
import MessageEditor from "../../components/messages/messageEditor";
dayjs.extend(relativeTime);

export interface Message {
  id: number,
  title: string,
  content: string,
  content_username?: string,
  content_nickname?: string,
  content_avatar?: string,
  created_at: Date,
  username: string,
  nickname: string,
  avatar: string,
  selected?: boolean,
}

export function GetRecipients(msg: {users: any, username: string, owner_username: string}) {
    // shoddy way of finding the reciever of the message (not accounting for group chats)
    let recievingUser: {username: string, nickname: string, avatar: string} =
    msg.users.find((u: { username: string; }) => (
      msg.owner_username == msg.username && msg.username != u.username
    ));

    // if this is true, that probably means we are messaging ourselves
    if(recievingUser == undefined) recievingUser = msg.users[0];

    return recievingUser;
}

export default function MessagesPage() {
  const router = useRouter();
  const rootDiv = useRef(null);
  const isInitialMount = useRef(true);
  const [user] = useRecoilState(userState);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activePage, setPage] = useState(0);
  const [maxPages, setMaxPages] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);
  const supabaseClient = createBrowserSupabaseClient();

  useEffect(() => {
    if (user) {
      setIsPageVisible(true);
      if(user.id) {
        let page = (router.query["page"] ? parseInt(router.query["page"] as string) : 1);
        setPage(page);
        setComposeOpen((router.query["compose"] != undefined));
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
    
    const { data: sqlMessages } = await supabaseClient.rpc('get_message_groups', {
      'msg_limit': limit, 'msg_offset': (page-1)*limit
    });
    if(sqlMessages && sqlMessages.length > 0) {
      // shoddy way of finding the reciever of the message (not accounting for group chats)
      let recievingUser = GetRecipients(sqlMessages[0]);
      let temp: Message[] = [];

      sqlMessages.forEach((msg: { group_id: any; title: any; msg: any; msg_username: any; msg_nickname: any; msg_avatar: any; created_at: any; }) => {
        temp.push({
          id: msg.group_id,
          title: msg.title,
          content: msg.msg,
          content_username: msg.msg_username,
          content_nickname: msg.msg_nickname,
          content_avatar: msg.msg_avatar,
          created_at: msg.created_at,
          username: recievingUser.username,
          nickname: recievingUser.nickname,
          avatar: recievingUser.avatar
        })
      })
      setMessages(temp);
      setMaxPages(Math.ceil(sqlMessages[0].full_count / limit));
    }
  }

  return (<>
    <Head>
      <title>Messages</title>
    </Head>
    <div ref={rootDiv}>
      <Modal
        opened={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Compose Message"
        target={rootDiv.current!} withinPortal={false}
        styles={{
          root: {position: 'static'},
          content: {zIndex: 2},
          overlay: {zIndex: 1}
        }}
      >
        <MessageEditor isModal user={user} recipient={router.query["compose"] as string} 
          onClose={() => setComposeOpen(false)} 
          addMessage={(msg) => {
            setMessages((prevMessages) => [msg, ...prevMessages]);
          }}/>
      </Modal>
      <div className="flex border-b border-gray-900 dark:border-white shadow-lg p-5 whitespace-nowrap">
        <Checkbox label="Select All" />
        {maxPages > 1 && <div className="flex flex-col w-full items-end">
          <Pagination value={activePage} total={maxPages} siblings={0} defaultValue={1} 
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
      <Messages user={user} messages={messages}/>
    </div>
  </>
  );
}