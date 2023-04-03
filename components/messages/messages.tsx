import { Checkbox, Anchor, Image, Button } from "@mantine/core";
import dayjs from "dayjs";
import Link from "next/link";
import router from "next/router";
import { Message } from "../../pages/messages";
import { User } from "../../recoil/user.recoil";

interface Props {
  user: User,
  messages: Message[];
}

export default function Messages({user, messages}: Props) {
  return (<>
      {messages.map((message) => {
        return (
          <Button onClick={() => router.push(`/messages/${message.id}`)}
            key={message.id} variant="subtle" color="gray" 
            styles={(theme) => ({
              root: {
                border: 0,
                height: 'auto',
                width: '100%',
                padding: 20,
              },
              label: {
                width: '100%'
              }
            })}
          >
          <div className="font-normal w-full">
            <div className="flex space-x-4 w-full">
              <Checkbox onClick={(event) => {event.stopPropagation();}}/>
              <div>
                <Image width={64} alt="profile picture" radius="md"
                  src={(message.avatar == null ? '/default_profile.png' : message.avatar)}/>
              </div>
              <div className="text-sm w-full truncate">
                <div className="flex flex-row w-full whitespace-nowrap">
                  <span className="font-semibold">{message.nickname}</span>
                  <div className="pl-1 text-xs">
                    <Link passHref href={{
                      pathname: `/profile/[username]`,
                      query: {
                        username: message.username,
                      },
                    }}>@{message.username}</Link>
                  </div>
                  <span className="w-full text-right">{dayjs().to(dayjs(message.created_at))}</span>
                </div>
                <span className="font-bold">
                  {message.title}
                </span>
                <br/>
                <span className="text-xs">
                  {user && (user.username === message.content_username ? <b>You: </b> : <b>{message.content_nickname}: </b>)} {message.content}
                </span>
              </div>
            </div>
          </div>
        </Button>
        );
      })}
  </>);
}