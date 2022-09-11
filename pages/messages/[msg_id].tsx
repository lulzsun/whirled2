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
import MessageEditor from '../../components/messages/messageEditor';
import { Message } from '.';
import { RealtimeSubscription } from '@supabase/supabase-js';
dayjs.extend(relativeTime);

export default function Id() {
  const router = useRouter();
  const { msg_id } = router.query;
  const isInitialMount = useRef(true);
  const [user] = useRecoilState(userState);
  const [activePage, setPage] = useState(0);
  const [maxPages, setMaxPages] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);
  const [recipient, setRecipient] = useState('');
  const endOfChat = useRef<HTMLDivElement>(null);
  const [idNameMap, setIdNameMap] = useState(new Map());
  
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
    // This is a hack for React >= v18 in Strict mode
    // ensures to always call on the last mount and
    // correctly remove subscription on unmount
    // https://discord.com/channels/839993398554656828/1006849587723632751/1009596156235497563
    // https://discord.com/channels/839993398554656828/1009076491922985051/1009856310860328971
    let subscription: RealtimeSubscription | null = null;
    const timer = setTimeout(() => subscription = subscribeToTable(), 1000);

    function subscribeToTable() {
      return (
        supabaseClient
        .from('messages:parent_id=eq.' + parseInt(msg_id as string))
        .on('INSERT', (payload) => {
          console.log('Change received!', payload.new)
          setMessages((prevMessages) => [{
            id: payload.new.id,
            title: payload.new.title,
            content: payload.new.content,
            content_sender: idNameMap.get(payload.new.sender_id),
            reciever_name: idNameMap.get(payload.new.reciever_id),
            sender_name: idNameMap.get(payload.new.sender_id),
            sender_nick: payload.new.sender_nick,
            sender_avatar: payload.new.sender_avatar,
            created_at: payload.new.created_at
          }, ...prevMessages]);
        })
        .subscribe((msg: string) => {
          console.log(msg);
        })
      );
    }

    return () => {
      if (!subscription) {
        return clearTimeout(timer);
      }

      supabaseClient.removeSubscription(subscription);
    };
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      getMessagesFromSupa(activePage);
    }
  }, [activePage]);

  useEffect(() => {
    endOfChat.current?.scrollIntoView({ behavior: 'smooth' });
    function handleResize() {
    }

    console.log(messages);
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [messages]);

  async function getMessagesFromSupa(page: number=1, limit: number=10) {
    if(page < 1) page = 1;
    
    const { data: sqlMessages } = await supabaseClient.rpc('get_message_thread', {
      msg_id, 'msg_limit': limit, 'msg_offset': (page-1)*limit
    });
    if(sqlMessages && sqlMessages.length > 0) {
      let newIdNameMap = new Map();
      sqlMessages.map((msg) => {
        newIdNameMap.set(msg.reciever_id, msg.reciever_name);
        newIdNameMap.set(msg.sender_id, msg.reciever_name)
      });
      setIdNameMap(newIdNameMap);
      setRecipient(sqlMessages[0].reciever_name);
      setMessages(sqlMessages);
      setMaxPages(Math.ceil(sqlMessages[0].full_count / limit));
    }
  }
  
  return (<div className='w-full h-full flex flex-col'>
    <div className="flex-auto w-full overflow-hidden">
      <div className='h-full overflow-y-scroll'>
        <div className='h-full mx-auto space-y-2 flex flex-col-reverse justify-end p-4 content-end'>
          <div ref={endOfChat}/>
          {messages.map((message, i) => {
            return (
              <div key={message.id} style={{wordBreak: 'break-word'}} 
              className={"flex flex-row space-x-2 text-left " + 
              (message.sender_name == user.username ? 'place-self-end' : '')}>
                {message.sender_name != user.username && (i+1 == messages.length || (messages[i+1].sender_name != message.sender_name)) && (<div>
                  <Image width={64} alt="profile picture" radius="md"
                    src={(message.sender_avatar == null ? '/default_profile.png' : message.sender_avatar)}/>
                </div>)}
                <div className='flex flex-col'>
                  <div className={'text-sm -mt-1 ' + (message.sender_name == user.username ? 'place-self-end' : '')}>
                    {message.sender_name} sent {dayjs().to(dayjs(message.created_at))}
                  </div>
                  <div className={"border border-gray-900 dark:border-white shadow-lg p-2.5 rounded-2xl " + 
                  (message.sender_name == user.username ? 'rounded-tr-none' : 'rounded-tl-none')}>
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
                {message.sender_name == user.username && (i+1 == messages.length || (messages[i+1].sender_name != message.sender_name)) && (<div>
                  <Image width={64} alt="profile picture" radius="md"
                    src={(message.sender_avatar == null ? '/default_profile.png' : message.sender_avatar)}/>
                </div>)}
              </div>
            );
          })}
          <div className='h-full'/>
        </div>
      </div>
    </div>
    <div className='flex-initial p-4'>
      {recipient && <MessageEditor recipient={recipient} parent_id={parseInt(msg_id as string)} 
        addMessage={(msg) => {
          console.log(msg);
        }}
      />}
    </div>
  </div>
  );
}