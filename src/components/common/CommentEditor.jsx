import React, { useContext, useState, useRef } from 'react';
import { ArrowReturnLeft } from 'react-bootstrap-icons';
import defaultPhoto from "../../media/profile_photo.png";
import axios from 'axios';
import { UserContext } from '../../Contexts';

export default function CommentEditor ({hidden, parentId, parentType, localComments, setLocalComments}) {
  const {user} = useContext(UserContext);
  const [commentText, setCommentText] = useState('');
  const textDiv = useRef();

  async function handleSubmit() {
    try {
      if(parentId == null) throw new Error('parentId is null');
      if(parentType == null) throw new Error('parentType is null');
      if(commentText.trim() === '') throw new Error('commentText is null');

      const commentJson = {
        parentId,
        parentType,
        content: commentText
      }
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/comment`, JSON.stringify(commentJson), {
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('accessToken'),
          'Content-Type': 'application/json'
        }
      });
      if(res.data) {
        textDiv.current.innerText = '';
        setCommentText('');
        console.log(res.data);
        const localComment = {
          user: res.data.user,
          content: res.data.comment.content,
          createdAt: res.data.comment.createdAt,
          _id: res.data.comment._id,
        }
        setLocalComments([...localComments, localComment]);
      }
    } catch (error) {
      if(error !== undefined)
      console.error(error);
    }
  }

  return (
    <div hidden={hidden}>
      <div className="flex mt-4 mb-4">
        <img alt="profileIcon" src={
          (
						(user.profilePicture === '' || user.profilePicture === undefined) ?
						(defaultPhoto) : (`${process.env.REACT_APP_S3_URL}${user.profilePicture}`)
					)
        } className="mt-1 mx-auto object-cover rounded-full h-10 w-10"/>
        <div className='text-gray-400 ml-2 w-full bg-gray-700 h-auto rounded-xl'>
          <div hidden={commentText!==''} className="pointer-events-none absolute p-3">Leave a comment!</div>
          <div className='focus:text-white w-full p-3 break-all focus:outline-none' 
          //https://stackoverflow.com/a/49639256/8805016
          contentEditable="true" onInput={e => setCommentText(e.currentTarget.textContent)} ref={textDiv}></div>
        </div>
        <div className="flex items-end h-fill">
          <div className="cursor-pointer ml-2 mb-3 w-5 h-5" onClick={handleSubmit}>
            <ArrowReturnLeft/>
          </div>
        </div>
      </div>
    </div>
  );
}