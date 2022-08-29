import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
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
  user_id: string,
  parent_id?: number,
  content: string,
  created_at: Date,
  updated_at: Date,
  username: string,
  nickname: string,
  avatar_url?: string,
  children: Comment[],
  hidden_children: number,
  votes: number,
  self_votes: number,
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

    let newComments: Comment[] = [];
    if(comments.length != 0 && comments[comments.length-1].id !== -1)
      newComments = Array.from(comments);
    sqlComments?.forEach(sqlComment => {
      let t: Comment = sqlComment;
      t.children = [];
      let cIndex = newComments.findIndex(c => c.id == t.id);
      if(cIndex != -1) {
        newComments[cIndex] = t;
      }
      else {
        newComments.push(t);
      }
    });

    let selfVotedComments: number[] = [];
    newComments.forEach((comment) => {
      selfVotedComments.push(comment.id);
    });

    const { data: sqlSelfVotes } = await supabaseClient.from('votes').select('comment_id, value').filter('comment_id','in',`(${selfVotedComments})`);

    if(!sqlSelfVotes) return;

    newComments.forEach(nc => {
      let sv = sqlSelfVotes.find(sv => sv.comment_id == nc.id);
      if(sv)  nc.self_votes = sv.value;
      else    nc.self_votes = 0;
    })

    console.log(newComments);
    setComments(newComments);
  }

  const Comment = ({comment}: CommentProps) => {
    const [votes, setVotes] = useState(comment.votes | 0);

    async function setVote(isUpvote: boolean) {
      if(isUpvote) {
        comment.self_votes++;
        if(comment.self_votes > 1) comment.self_votes = 0; 
        else if(comment.self_votes == 0) comment.self_votes = 1;
      }
      else {
        comment.self_votes--;
        if(comment.self_votes < -1) comment.self_votes = 0; 
        else if(comment.self_votes == 0) comment.self_votes = -1;
      }
      
      const { data, error } = await supabaseClient.from("votes").upsert({comment_id: comment.id, value: comment.self_votes});

      if(error) {
        console.log(error);
        return;
      }

      setVotes((comment.votes | 0) + comment.self_votes);
    }

    const nestedComments = (comment.children || []).map((comment) => {
      return <Comment key={comment.id} comment={comment} />
    })
  
    return (
      <div className="border-l pl-4">
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
              <div className="text-xs">• {dayjs().to(dayjs(comment.created_at))}</div>
            </div>
            <div className="text-sm"><ReactMarkdown>{comment.content}</ReactMarkdown></div>
            <div className="flex flex-row items-center -ml-2 pb-1.5">
              <ActionIcon variant={(comment.self_votes == 1 ? 'outline' : 'subtle')} color="orange" onClick={() => setVote(true)}><IconArrowUp size={16}/></ActionIcon>
              <span className="text-xs px-2">{votes}</span>
              <ActionIcon variant={(comment.self_votes ==-1 ? 'outline' : 'subtle')} color="blue" onClick={() => setVote(false)}><IconArrowDown size={16}/></ActionIcon>
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
        if(comment.id == -1) return <></>;
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