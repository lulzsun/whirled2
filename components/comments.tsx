import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";
import Image from 'next/image';

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
    <div className="flex flex-col space-y-4 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
      {comments?.map((comment) => {
        return <Comment key={comment.id} comment={comment} />
      })}
    </div>
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
    <div className="mt-2 ml-4">
      <div className="flex flex-row space-x-2 mb-2">
        <div>
          <Image className="rounded-2xl" 
          src={(comment.avatar_url == null ? '/default_profile.png' : comment.avatar_url)} 
          alt="profile picture" width="24" height="24" />
        </div>
        <div className="flex-none">
          <div style={{margin: '0 0 2px 0', fontSize: '9pt'}}>
            {comment.nickname} | @{comment.username}
          </div>
          <div style={{fontSize: '10pt' }}>{comment.content}</div>
        </div>
      </div>
      {(comment.hidden_children == 0 ? 
        nestedComments
        : 
        (<div style={{fontSize: '10pt' }}>
          {`${comment.hidden_children} more repl` + (comment.hidden_children > 1 ? 'ies' : 'y')}
        </div>)
      )}
    </div>
  )
}