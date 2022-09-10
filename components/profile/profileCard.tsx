import { useRouter } from "next/router";
import { Profile } from "../../pages/profile/[username]";
import { Button, Image } from "@mantine/core";
import { User } from "../../recoil/user.recoil";
import { IconMessage2, IconUserPlus } from "@tabler/icons";

interface Props {
  profile: Profile;
  user: User;
}

export default function ProfileCard({profile, user}: Props) {
  const router = useRouter();

  return (
    <div className="border border-gray-900 dark:border-white shadow-lg rounded-3xl p-4 m-4">
      <div className="flex flex-row space-x-4" style={{wordBreak: 'break-word'}}>
        <div>
          <Image width={128} alt="profile picture" radius="lg"
            src={(profile.avatar_url == null ? '/default_profile.png' : profile.avatar_url)}/>
        </div>
        <div className="flex flex-col relative w-full" style={{height: '128px'}}>
          <span className="w-full flex-none text-lg text-gray-200 font-bold leading-none">{profile.nickname}</span>
          <div className="flex flex-col">
            <div className="flex-auto text-gray-400 my-1 text-xs">
              <span className="mr-3">@{profile.username}</span>
              <span className="mr-3 border-r border-gray-600 max-h-0"></span>
              <span>Level {'0'}</span>
            </div>
            <p className="text-sm" style={{
              display: '-webkit-box',
              overflow: 'hidden',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</p>
          </div>
          <div className="flex flex-row items-end place-content-between absolute bottom-0 w-full">
            <div/>
            <div className="flex space-x-2">
              {user && <Button size="xs" leftIcon={<IconMessage2 size={14}/>} onClick={() => {router.push(`/messages?compose=${profile.username}`)}}>Message</Button>}
              {/* <Button size="xs" leftIcon={<IconUserPlus size={14} />}>Add Friend</Button> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}