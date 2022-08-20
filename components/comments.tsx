import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { Fragment, useEffect, useState } from "react";

type Props = {
  id: string;
  type_id: string;
}

type CommentProps = {
  comment: Comment
}

interface Comment {
  id: number, 
  parent_id: number,
  content: string,
  children: Comment[],
}

export default function Comments({id, type_id}: Props) {
  const [comments, setComments] = useState<Comment[]>();
  useEffect(() => {
    (async () => {
      const { data: sqlComments } = await supabaseClient.from('comments').select('id, content, parent_id').order('id').eq(type_id, id);
      let newComments: Comment[] = [];

      sqlComments?.forEach(sqlComment => {
        let t: Comment = {
          id: sqlComment.id,
          parent_id: sqlComment.parent_id,
          content: sqlComment.content,
          children: [],
        } 
        newComments.push(t);
      });

      console.log(createTree(newComments));
      setComments(createTree(newComments));
    })();
  }, []);

  const CommentNode = ({comment}: CommentProps) => {
    return (
      <div className="border border-white-900 shadow-lg rounded-3xl p-4 m-4">
        {/* parent */}
        {comment.id}....{comment.content}
        {/* children, if any */}
        {/* {(comment.children && comment.children.length > 0) && comment.children.map((index: number) => (
          (comments[index].children) &&
          <Fragment key={comment.id}>
            <CommentNode comment={comment}/>
          </Fragment>
        ))} */}
      </div>
    )
  }

  return (
    <div className="border border-white-900 shadow-lg rounded-3xl p-4 m-4">
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
    <div style={{ marginLeft: '25px', marginTop: '16px' }}>
      <div
        style={{margin: '0 0 2px 0', fontSize: '9pt' }}
      >
        {comment.id}
      </div>
      <div style={{fontSize: '10pt' }}>{comment.content}</div>
      {nestedComments}
    </div>
  )
}