import React from 'react';
import defaultPhoto from "../../media/profile_photo.png";
import { ThreeDots } from 'react-bootstrap-icons';
import moment from 'moment';
import { Link } from 'react-router-dom';
import DropDownMenu from '../common/tail-kit/elements/ddm/DropDownMenu'

export default function CommentSection ({commentArray, localComments}) {
  function handleCommentOptions(e) {
    console.log(e.currentTarget);
  }
  return (
    <div className="flex flex-col">
      {commentArray.concat(localComments).slice(0).reverse().map((comment) => {
        //console.log(comment);
        if(comment === null) return <></>
        if(!comment.user) {
          comment.user = {
            displayName: 'banned',
            username: 'banned',
            profilePicture: '',
          }
        }

        return (
          <div key={comment._id} className="flex mt-2 group hover:bg-gray-800 rounded-lg">
            <Link className="cursor-pointer" to={(comment.user.username === 'banned' ? `#` : `/${comment.user.username}`)}>
              <img alt="profileIcon" src={(comment.user.profilePicture !== '' ? `${process.env.REACT_APP_S3_URL}${comment.user.profilePicture}` : defaultPhoto)} 
                className="inline mt-1.5 object-cover rounded-full h-10 w-10"/>
            </Link>
            <div className="pl-4 inline w-full flex flex-col">
              <div className="flex flex-row text-gray-400">
                <div className="w-full items-center">
                  <Link className="cursor-pointer" to={(comment.user.username === 'banned' ? `#` : `/${comment.user.username}`)}>
                    <span className="mr-2 text-white font-semibold">{comment.user.displayName}</span>
                    <span className="mr-2 border-r border-gray-600 max-h-0"></span>
                    <span className="mr-2 text-xs">@{comment.user.username}</span>
                    <span className="mr-2 border-r border-gray-600 max-h-0"></span>
                    <span className="mr-2 text-xs">{moment(comment.createdAt).fromNow()}</span>
                  </Link>
                </div>
                <div className="flex-1 inline-flex justify-end" onClick={(e) => handleCommentOptions(e)}>
                  <div className="p-2 text-xs text-white bg-green-500 hover:bg-green-600 cursor-pointer rounded-full opacity-0 group-hover:opacity-100">
                    <ThreeDots/>
                  </div>
                </div>
              </div>
              <span className="break-all text-gray-300 group-hover:text-gray-100">{comment.content}</span>
            </div>
          </div>
        )
      })}
    </div>
  );
}