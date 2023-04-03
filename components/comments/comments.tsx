import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { Image } from "@mantine/core";
import ReactMarkdown from 'react-markdown';
import Link from "next/link";
import { ActionIcon, Anchor, Button, Pagination } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
import { IconArrowDown, IconArrowUp, IconMessage } from "@tabler/icons-react";
import ProfileCommentEditor from "./commentEditor";
import { User } from "../../recoil/user.recoil";
dayjs.extend(relativeTime);

type Props = {
  profile_id: string;
  comments: Comment[];
  setComments: Dispatch<SetStateAction<Comment[]>>;
  user: User;
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
  full_count?: number
}

export default function ProfileComments({profile_id, comments, setComments, user}: Props) {
  const isInitialMount = useRef(true);
  const [activePage, setPage] = useState(1);
  const [maxPages, setMaxPages] = useState(0);
  const [replyId, setReplyId] = useState(-1);
  const supabaseClient = useSupabaseClient();
  
  useEffect(() => {
    getCommentsFromSupa(0);
  }, [profile_id]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
    } else {
      getCommentsFromSupa(0, (activePage-1));
    }
  }, [activePage]);

  async function getCommentsFromSupa(parent_id: number = -1, page: number = 0, parent_limit: number = 5) {
    let newComments: Comment[] = [];
    if(comments.length != 0 && parent_id != 0) {
      newComments = Array.from(comments);
    }
    if(parent_id == 0) parent_id = -1;
    
    const { data: sqlComments } = await supabaseClient.rpc('get_profile_comments', {
      '_profile_id': profile_id, parent_offset: page*parent_limit, parent_limit, 'max_depth': 3, '_parent_id': parent_id
    });

    sqlComments?.forEach((sqlComment: Comment) => {
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

      if(nc.full_count != null && parent_id == -1) {
        setMaxPages(Math.ceil(nc.full_count / parent_limit));
      }
    });
    setComments(newComments);
  }

  const Comment = ({comment}: CommentProps) => {
    const [selfVotes, setSelfVotes] = useState(comment.self_votes | 0);
    const [originalSelfVote] = useState(comment.self_votes | 0);

    function calcVotesWithoutSelf() {
      if(originalSelfVote < 0) return 1
      else if(originalSelfVote > 0) return -1
      else return 0;
    }

    async function setVote(isUpvote: boolean) {
      let oldVote = comment.self_votes;

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
        comment.self_votes = oldVote;
        return;
      }

      setSelfVotes(comment.self_votes);
    }

    const nestedComments = (comment.children || []).map((comment) => {
      return <Comment key={comment.id} comment={comment} />
    })
  
    return (
      <div className="border-l pl-4 mt-2">
        <div className="flex flex-row space-x-2" style={{wordBreak: 'break-word'}}>
          <div>
            <Image width={24} alt="profile picture" radius="md"
              src={(comment.avatar_url == null ? '/default_profile.png' : comment.avatar_url)}/>
          </div>
          <div className='flex flex-col w-full'>
            <div className="flex flex-row space-x-1">
              <div className="text-sm font-semibold">{comment.nickname}</div>
              <div className="text-xs">
                <Link passHref href={{
                  pathname: `/profile/[username]`,
                  query: {
                    username: comment.username,
                  },
                }}>@{comment.username}</Link>
              </div>
              <div className="text-xs">• {dayjs().to(dayjs(comment.created_at))}</div>
            </div>
            <div>
              <ReactMarkdown className="text-sm">{comment.content}</ReactMarkdown>
            </div>
            <div className="flex flex-row items-center -ml-2 pb-1.5">
              <ActionIcon variant={(selfVotes == 1 ? 'outline' : 'subtle')} color="orange" 
                onClick={() => {
                  if(!user) {
                    alert('You must be logged in to perform this action!');
                    return;
                  }
                  setVote(true);
                }}>
                <IconArrowUp size={16}/>
              </ActionIcon>
              <span className="text-xs px-2">{comment.votes + calcVotesWithoutSelf() + selfVotes}</span>
              <ActionIcon variant={(selfVotes ==-1 ? 'outline' : 'subtle')} color="blue" onClick={() => {
                if(!user) {
                  alert('You must be logged in to perform this action!');
                  return;
                }
                setVote(false);
              }}>
                <IconArrowDown size={16}/>
              </ActionIcon>
              <Button variant="subtle" color="gray" size="xs" leftIcon={<IconMessage size={14}/>} onClick={() => {
                if(!user) {
                  alert('You must be logged in to perform this action!');
                  return;
                }
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
      <div className="mx-auto grid grid-cols-1 w-full">
        {comments && createTree(comments).map((comment) => {
          if(comment.id > 0) { // there shouldn't be any id less than 0 unless we are using them for a purpose
            return <Comment key={comment.id} comment={comment} />
          }
        })}
      </div>
      {maxPages > 1 && <div className="w-full flex justify-center">
        <Pagination value={activePage} onChange={(index) => {setPage(index);}} total={maxPages} siblings={1} defaultValue={1}/>
      </div>}
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