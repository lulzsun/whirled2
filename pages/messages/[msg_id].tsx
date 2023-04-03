import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';
import { pageVisibiltyState } from '../../recoil/pageVisibility.recoil';
import { userState } from '../../recoil/user.recoil';
import { Anchor, Image, Tooltip } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import ReactMarkdown from 'react-markdown';
import MessageEditor from '../../components/messages/messageEditor';
import { GetRecipients, Message } from '.';
import { RealtimeChannel } from '@supabase/supabase-js';
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
  const supabaseClient = createBrowserSupabaseClient();
  
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
    let subscription: RealtimeChannel | null = null;
    const timer = setTimeout(() => subscription = subscribeToTable(), 1000);

    function subscribeToTable() {
      return (
        supabaseClient
        .channel('any')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'group_id=eq.' + parseInt(msg_id as string) }, 
        (payload) => {
          if(payload.new.user_id == user.id) return;
          setMessages((prevMessages) => [{
            id: payload.new.id,
            title: payload.new.title,
            content: payload.new.content,
            created_at: new Date(),
            username: idNameMap.get(payload.new.user_id).username,
            nickname: idNameMap.get(payload.new.user_id).nickname,
            avatar: idNameMap.get(payload.new.user_id).avatar,
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

      supabaseClient.removeChannel(subscription);
    };
  }, [idNameMap]);

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
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [messages]);

  async function getMessagesFromSupa(page: number=1, limit: number=10) {
    if(page < 1) page = 1;
    
    const { data: sqlMessages } = await supabaseClient.rpc('get_messages', {
      msg_id, 'msg_limit': limit, 'msg_offset': (page-1)*limit
    });
    if(sqlMessages && sqlMessages.length > 0) {
      let recievingUser = GetRecipients(sqlMessages[0]);
      let tempMap = new Map();

      interface User {
        id: string, nickname: string, username: string, avatar_url: string
      }

      sqlMessages[0].users.forEach((user: User) => {
        tempMap.set(user.id, {
          nickname: user.nickname, 
          username: user.username,
          avatar_url: user.avatar_url
        });
      })

      // this map helps us keep track of who the user is on a realtime message (realtime message only provides user id)
      console.log(tempMap);
      setIdNameMap(tempMap);
      setRecipient(recievingUser.username);
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
              (message.username == user.username ? 'place-self-end' : '')}>
                {message.username != user.username && (i+1 == messages.length || (messages[i+1].username != message.username)) && 
                  (<Anchor href={`/profile/${message.username}`}>
                    <Image width={64} alt="profile picture" radius="md"
                      src={(message.avatar == null ? '/default_profile.png' : message.avatar)}/>
                  </Anchor>)}
                <div className='relative flex flex-col'>
                  {(i+1 == messages.length || (messages[i+1].username != message.username)) && 
                  <div className={'whitespace-nowrap absolute text-sm -mt-1.5 ' + (message.username == user.username ? 'place-self-end' : '')}>
                    {message.username} sent {dayjs().to(dayjs(message.created_at))}
                  </div>}
                  <Tooltip label={`${message.username} sent ${dayjs().to(dayjs(message.created_at))}`}
                    disabled={(i+1 == messages.length || (messages[i+1].username != message.username))}>
                    <div className={((i+1 == messages.length || (messages[i+1].username != message.username)) && "mt-4") + 
                      " border border-gray-900 dark:border-white shadow-lg p-2.5 rounded-2xl " + 
                    (message.username == user.username ? 'rounded-tr-none' : 'rounded-tl-none')}>
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </Tooltip>
                </div>
                {message.username == user.username && (i+1 == messages.length || (messages[i+1].username != message.username)) && 
                  (<Anchor href={`/profile/${message.username}`}>
                    <Image width={64} alt="profile picture" radius="md"
                      src={(message.avatar == null ? '/default_profile.png' : message.avatar)}/>
                  </Anchor>)}
              </div>
            );
          })}
          <div className='h-full'/>
        </div>
      </div>
    </div>
    <div className='flex-initial p-4'>
      {recipient && <MessageEditor user={user} recipient={recipient} group_id={parseInt(msg_id as string)} 
        addMessage={(msg) => {
          setMessages((prevMessages) => [{
            id: msg.id,
            title: msg.title,
            content: msg.content,
            created_at: new Date(),
            username: user.username,
            nickname: user.nickname,
            avatar: user.avatar_url
          }, ...prevMessages]);
        }}
      />}
    </div>
  </div>
  );
}