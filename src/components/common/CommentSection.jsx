import React from 'react';
import defaultPhoto from "../../media/profile_photo.png";
import { ThreeDots } from 'react-bootstrap-icons';
import moment from 'moment';

export default function CommentSection ({commentArray, localComments}) {
  return (
    <div className="flex flex-col">
      {commentArray.concat(localComments).slice(0).reverse().map((comment) => {
        //console.log(comment);
        if(comment === null) return <></>
        return (
          <div key={comment._id} className="flex mt-2 group">
            <img alt="profileIcon" src={(comment.user.profilePicture !== '' ? `${process.env.REACT_APP_S3_URL}${comment.user.profilePicture}` : defaultPhoto)} 
              className="group-hover:opacity-50 inline mt-1.5 object-cover rounded-full h-10 w-10"/>
            <div className="pl-4 inline w-full flex flex-col">
              <div className="flex flex-row text-gray-400">
                <div className="flex-1 inline items-center">
                  <span className="group-hover:opacity-50 mr-2 text-white font-semibold">{comment.user.displayName}</span>
                  <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
                  <span className="group-hover:opacity-50 mr-2 text-xs">@{comment.user.username}</span>
                  <span className="group-hover:opacity-50 mr-2 border-r border-gray-600 max-h-0"></span>
                  <span className="group-hover:opacity-50 mr-2 text-xs">{moment(comment.createdAt).fromNow()}</span>
                </div>
                <div className="flex-1 inline-flex justify-end">
                  <div className="p-2 text-xs text-white bg-green-500 hover:bg-green-600 cursor-pointer rounded-full opacity-0 group-hover:opacity-100">
                    <ThreeDots/>
                  </div>
                </div>
              </div>
              <span className="group-hover:opacity-50">{comment.content}</span>
            </div>
          </div>
        )
      })}
    </div>
  );
}