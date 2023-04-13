import { Button, Image } from "@mantine/core";
import { IconMessage2 } from "@tabler/icons-react";
import { navigate } from "vite-plugin-ssr/client/router";

interface Props {
  profile: Profile;
}

export interface Profile {
  username: string,
  nickname: string,
  level: number,
  status: string
}

export default function ProfileCard({profile}: Props) {
  return (
    <div className="border border-solid border-gray-900 dark:border-white shadow-lg rounded-3xl p-4 m-4">
      <div className="flex flex-row space-x-4" style={{wordBreak: 'break-word'}}>
        <div>
          <Image width={128} alt="profile picture" radius="lg"
            src={('../default_profile.png')}/>
        </div>
        <div className="flex flex-col relative w-full" style={{height: '128px'}}>
          <span className="w-full flex-none text-lg text-gray-200 font-bold leading-none">{profile.nickname}</span>
          <div className="flex flex-col">
            <div className="flex-auto text-gray-400 my-1 text-xs">
              <span className="mr-3">@{profile.username}</span>
              <span className="mr-3 border-r border-gray-600 max-h-0"></span>
              <span>Level {profile.level}</span>
            </div>
            <p className="text-sm overflow-hidden mt-1" style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>{profile.status}</p>
          </div>
          <div className="flex flex-row items-end place-content-between absolute bottom-0 w-full">
            <div/>
            <div className="flex space-x-2">
              {profile.username && <Button size="xs" leftIcon={<IconMessage2 size={14}/>} onClick={() => {navigate(`/messages?compose=${profile.username}`)}}>Message</Button>}
              {/* <Button size="xs" leftIcon={<IconUserPlus size={14} />}>Add Friend</Button> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}