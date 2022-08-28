import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import Link from "next/link";
import { ActionIcon, Anchor, Button } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import { IconArrowDown, IconArrowUp, IconMessage } from "@tabler/icons";
import ProfileCommentEditor from "./commentEditor";
dayjs.extend(relativeTime);

type Props = {
  profile_id: string;
  comments: Comment[];
  setComments: Dispatch<SetStateAction<Comment[]>>;
}

type CommentProps = {
  comment: Comment
}

export interface Comment {
  id: number, 
  parent_id: number,
  content: string,
  created_at: Date,
  updated_at: Date,
  username: string,
  nickname: string,
  avatar_url: string,
  children: Comment[],
  hidden_children: number,
}

export default function ProfileComments({profile_id, comments, setComments}: Props) {
  const [replyId, setReplyId] = useState(-1);
  
  useEffect(() => {
    getCommentsFromSupa();
    setReplyId(-1);
  }, [comments?.length]);

  async function getCommentsFromSupa(parent_id: number = -1) {
    const { data: sqlComments } = await supabaseClient.rpc('get_profile_comments', {
      '_profile_id': profile_id, 'parent_offset': 0, 'parent_limit': 5, 'max_depth': 3, '_parent_id': parent_id
    });

    let newComments: Comment[] = Array.from(comments);
    sqlComments?.forEach(sqlComment => {
      let t: Comment = sqlComment;
      t.children = [];
      if(!newComments.some(c => c.id === t.id)) {
        newComments.push(t);
      }
    });

    setComments(newComments);
  }

  const Comment = ({comment}: CommentProps) => {
    const nestedComments = (comment.children || []).map((comment) => {
      return <Comment key={comment.id} comment={comment} />
    })
  
    return (
      <div className="border-l pl-4 pb-1.5">
        <div className="flex flex-row space-x-2">
          <div>
            <Image className="rounded-2xl" 
            src={(comment.avatar_url == null ? '/default_profile.png' : comment.avatar_url)} 
            alt="profile picture" width="24" height="24" />
          </div>
          <div className="flex-none grow">
            <div className="flex flex-row space-x-1">
              <div className="text-sm font-semibold">{comment.nickname}</div>
              <div className="text-xs">
                <Link passHref href={{
                  pathname: `/profile/[username]`,
                  query: {
                    username: comment.nickname,
                  },
                }}><Anchor component="a">@{comment.nickname}</Anchor></Link>
              </div>
              <div className="text-xs">
                • {dayjs().to(dayjs(comment.created_at))}
              </div>
            </div>
            <div className="text-sm"><ReactMarkdown>{comment.content}</ReactMarkdown></div>
            <div className="flex flex-row items-center -ml-2">
              <ActionIcon variant="subtle" color="orange"><IconArrowUp size={16}/></ActionIcon>
              <span className="text-xs">0</span>
              <ActionIcon variant="subtle" color="blue"><IconArrowDown size={16}/></ActionIcon>
              <Button variant="subtle" color="gray" size="xs" leftIcon={<IconMessage size={14}/>} onClick={() => {
                if(replyId != comment.id) setReplyId(comment.id);
                else setReplyId(-1);
              }}>
              {`Reply`}
              </Button>
            </div>
            {replyId == comment.id && <div className="pb-2">
              <ProfileCommentEditor profile_id={profile_id} parent_id={comment.id} comments={comments} setComments={setComments}/>
            </div>}
          </div>
        </div>
        {(comment.hidden_children == 0 || comment.children.length > 0 ? nestedComments : 
          (<Button variant="subtle" color="gray" size="xs" onClick={() => {getCommentsFromSupa(comment.id)}}>
            {`${comment.hidden_children} more repl` + (comment.hidden_children > 1 ? 'ies' : 'y')}
          </Button>)
        )}
      </div>
    )
  }

  return (
    <>
      {comments && createTree(comments).map((comment) => {
        return <Comment key={comment.id} comment={comment} />
      })}
    </>
  );
}

function createTree(list: Comment[]) {
  var map: {[key: number]: number} = {}, node, roots = [], i;
  for (i = 0; i < list.length; i += 1) {
      map[list[i].id] = i; // initialize the map
      list[i].children = []; // initialize the children
  }
  for (i = 0; i < list.length; i += 1) {
      node = list[i];
      if (node.parent_id && list[map[node.parent_id]]) {
          // if you have dangling branches check that map[node.ParentId] exists
          list[map[node.parent_id]].children.push(node);
      } else {
          roots.push(node);
      }
  }
  return roots;
}