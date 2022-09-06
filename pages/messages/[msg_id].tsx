import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { pageVisibiltyState } from '../../recoil/pageVisibility.recoil';
import { userState } from '../../recoil/user.recoil';
import { Image } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import ReactMarkdown from 'react-markdown';
dayjs.extend(relativeTime);

interface Message {
  id: number,
  content: string,
  content_sender: string,
  created_at: Date,
  sender: string,
  sender_avatar: string | null,
  sender_nick: string,
  title: string
}

export default function Id() {
  const router = useRouter();
  const { msg_id } = router.query;
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
        setPage(1);
      }
    }
    else {
      router.push('/login');
    }
  }, [user]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      getMessagesFromSupa(activePage);
    }
  }, [activePage]);

  async function getMessagesFromSupa(page: number=1, limit: number=10) {
    if(page < 1) page = 1;
    
    const { data: sqlMessages } = await supabaseClient.rpc('get_message_thread', {
      msg_id, 'msg_limit': limit, 'msg_offset': (page-1)*limit
    });
    if(sqlMessages && sqlMessages.length > 0) {
      setMessages(sqlMessages);
      setMaxPages(Math.ceil(sqlMessages[0].full_count / limit));
    }
  }
  
  return (<>
    <div className="mx-auto space-y-2 grid grid-cols-1 p-4">
      {messages.slice(0).reverse().map((message) => {
        return (
          <div key={message.id} style={{wordBreak: 'break-word'}} 
          className={"flex flex-row space-x-2 text-left " + 
          (message.sender == user.username ? 'place-self-end' : '')}>
            {message.sender != user.username && (<div>
              <Image width={64} alt="profile picture" radius="md"
                src={(message.sender_avatar == null ? '/default_profile.png' : message.sender_avatar)}/>
            </div>)}
            <div className='flex flex-col'>
              <div className={'text-sm -mt-1 ' + (message.sender == user.username ? 'place-self-end' : '')}>
                {message.sender} sent {dayjs().to(dayjs(message.created_at))}
              </div>
              <div className={"border border-gray-900 dark:border-white shadow-lg p-5 rounded-2xl " + 
              (message.sender == user.username ? 'rounded-tr-none' : 'rounded-tl-none')}>
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            </div>
            {message.sender == user.username && (<div>
              <Image width={64} alt="profile picture" radius="md"
                src={(message.sender_avatar == null ? '/default_profile.png' : message.sender_avatar)}/>
            </div>)}
          </div>
        );
      })}
    </div>
  </>
  );
}