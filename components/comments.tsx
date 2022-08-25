import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import Link from "next/link";
import { Anchor, Button } from "@mantine/core";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime.js'
dayjs.extend(relativeTime);

type Props = {
  id: string;
}

type CommentProps = {
  comment: Comment
}

interface Comment {
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

export default function ProfileComments({id}: Props) {
  const [comments, setComments] = useState<Comment[]>();
  
  useEffect(() => {
    (async () => {
      const { data: sqlComments } = await supabaseClient.rpc('get_profile_comments', {
        '_profile_id': id, 'parent_offset': 0, 'parent_limit': 5, 'max_depth': 3
      });

      let newComments: Comment[] = [];
      sqlComments?.forEach(sqlComment => {
        let t: Comment = sqlComment;
        t.children = [];
        newComments.push(t);
      });

      console.log(sqlComments);
      setComments(createTree(newComments));
    })();
  }, []);

  return (
    <>
      {comments?.map((comment) => {
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
      if (node.parent_id) {
          // if you have dangling branches check that map[node.ParentId] exists
          list[map[node.parent_id]].children.push(node);
      } else {
          roots.push(node);
      }
  }
  return roots;
}

function Comment({comment}: CommentProps) {
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
        <div className="flex-none">
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
          <div className="text-sm pb-2"><ReactMarkdown>{comment.content}</ReactMarkdown></div>
        </div>
      </div>
      {(comment.hidden_children == 0 ? 
        nestedComments
        : 
        (<Button variant="subtle" color="gray">
          {`${comment.hidden_children} more repl` + (comment.hidden_children > 1 ? 'ies' : 'y')}
        </Button>)
      )}
    </div>
  )
}