import { supabaseClient } from "@supabase/auth-helpers-nextjs";
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
  content: string,
  content_sender: string,
  created_at: Date,
  reciever_id?: string,
  reciever_name: string,
  sender_id?: string,
  sender_name: string,
  sender_nick: string,
  sender_avatar: string | null,
  title: string,
  selected?: boolean,
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
    <div ref={rootDiv}>
      <Modal
        opened={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Compose Message"
        target={rootDiv.current!} withinPortal={false}
        styles={{
          root: {position: 'static'},
          modal: {zIndex: 2},
          overlay: {zIndex: 1}
        }}
      >
        <MessageEditor isModal recipient={router.query["compose"] as string} 
          onClose={() => setComposeOpen(false)} 
          addMessage={(msg) => {
            setMessages((prevMessages) => [{
              id: msg.id,
              title: msg.title,
              content: msg.content,
              content_sender: user.username,
              reciever_id: messages[0].reciever_id,
              reciever_name: messages[0].reciever_name,
              sender_name: user.username,
              sender_nick: user.nickname,
              sender_avatar: user.avatar_url,
              created_at: msg.created_at
            }, ...prevMessages]);
          }}/>
      </Modal>
      <div className="flex border-b border-gray-900 dark:border-white shadow-lg p-5 whitespace-nowrap">
        <Checkbox label="Select All" />
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
      <Messages user={user} messages={messages}/>
    </div>
  </>
  );
}