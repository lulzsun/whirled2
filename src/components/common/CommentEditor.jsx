import React, { useState, useRef } from 'react';
import { ArrowReturnLeft } from 'react-bootstrap-icons';
import defaultPhoto from "../../media/profile_photo.png";
import axios from 'axios';

export default function CommentEditor ({parentId, parentType}) {
  const [commentText, setCommentText] = useState('');
  const textDiv = useRef();

  async function handleSubmit() {
    try {
      if(parentId == null) throw 'parentId is null';
      if(parentType == null) throw 'parentType is null';
      if(commentText.trim() === '') throw 'commentText is null';

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
        console.log(res);
      }
    } catch (error) {
      if(error !== undefined)
      console.error(error);
    }
  }

  return (
    <div className="flex mt-4 mb-4">
      <img alt="profileIcon" src={defaultPhoto} className="mt-1 mx-auto object-cover rounded-full h-10 w-10"/>
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
  );
}