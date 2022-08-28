import { ActionIcon, Textarea } from '@mantine/core';
import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import { IconDots, IconSend } from '@tabler/icons';
import { Dispatch, SetStateAction, useState } from 'react';
import { Comment } from "../components/comments";

type Props = {
  profile_id: string;
  parent_id?: number;
  comments: Comment[];
  setComments: Dispatch<SetStateAction<Comment[]>>;
}

export default function ProfileCommentEditor({profile_id, parent_id, comments, setComments}: Props) {
  const [content, onChange] = useState('');
  return <div className='flex flex-row space-x-2'>
    <Textarea value={content} onChange={(event) => onChange(event.currentTarget.value)}
      className='grow'
      placeholder="Post a comment!"
      autosize
      minRows={2}
      maxRows={4}
      variant="filled"
    />
    <div className='flex flex-col justify-between'>
      <ActionIcon variant="filled" color="blue" onClick={async () => {
        const { data, error } = await supabaseClient.from('comments').insert([{ profile_id, content, parent_id }]).select('*, profiles!comments_user_id_fkey(*)');
        if(error) {
          console.log(error);
          return;
        }
        let comment = data[0];
        let newComments: Comment[] = Array.from(comments);
        let newComment: Comment = comment as unknown as Comment;
        newComment.username = comment.profiles.username;
        newComment.nickname = comment.profiles.nickname;
        newComment.avatar_url = comment.profiles.avatar_url;
        newComment.children = [];
        newComment.hidden_children = 0;
        newComments.unshift(newComment);
        setComments(newComments);
        onChange('');
      }}><IconSend size={16}/></ActionIcon>
      <ActionIcon variant="subtle" color="blue"><IconDots size={16}/></ActionIcon>
    </div>
  </div>;
}