import React from 'react';
import Comment from './Comment';

export default function CommentSection ({owner, commentArray, localComments}) {

  return (
    <div className="flex flex-col">
      {commentArray.concat(localComments).slice(0).reverse().map((comment) => {
        if(comment === null) return <></>
        if(!comment.user) {
          comment.user = {
            displayName: 'banned',
            username: 'banned',
            profilePicture: '',
          }
        }

        return (
          <Comment key={comment._id} owner={owner} comment={comment}/>
        )
      })}
    </div>
  );
}