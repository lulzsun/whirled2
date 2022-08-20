import { Profile } from "../../pages/profile/[username]";
import Image from 'next/image';

export default function ProfileCard(profile: Profile) {
  return (
    <div className="border border-white-900 shadow-lg rounded-3xl p-4 m-4">
      <div className="flex flex-row space-x-4">
        <Image className="rounded-2xl" src={(profile.avatar_url == null ? '/default_profile.png' : profile.avatar_url)} alt="profile picture" width="128" height="128" />
        <div>
          <span className="w-full flex-none text-lg text-gray-200 font-bold leading-none">{profile.nickname}</span>
          <div className="flex flex-col">
            <div className="flex-auto text-gray-400 my-1">
              <span className="mr-3">@{profile.username}</span>
              <span className="mr-3 border-r border-gray-600 max-h-0"></span>
              <span>Level {'0'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}