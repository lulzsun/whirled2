import { useState } from "react";
import { Profile } from "../pages/profile/[username]";
import ProfileCommentEditor from "./commentEditor";
import ProfileComments, { Comment } from "./comments";

export default function ProfileCommentSection(profile: Profile) {
  const [comments, setComments] = useState<Comment[]>([]);
  
  return (
    <div className="flex flex-col space-y-4 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
      <ProfileCommentEditor profile_id={profile.id} comments={comments} setComments={setComments}/>
      <ProfileComments profile_id={profile.id} comments={comments} setComments={setComments}/>
    </div>
  );
}