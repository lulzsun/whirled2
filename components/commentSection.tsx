import { useState } from "react";
import { Profile } from "../pages/profile/[username]";
import { User } from "../recoil/user.recoil";
import ProfileCommentEditor from "./commentEditor";
import ProfileComments, { Comment } from "./comments";

interface Props {
  profile: Profile;
  user: User;
}

export default function ProfileCommentSection({profile, user}: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  
  return (
    <div className="flex flex-col space-y-1 border border-gray-900 dark:border-white shadow-lg rounded-3xl p-4 m-4">
      {user && <ProfileCommentEditor profile_id={profile.id} comments={comments} setComments={setComments}/>}
      <ProfileComments profile_id={profile.id} comments={comments} setComments={setComments} user={user}/>
    </div>
  );
}