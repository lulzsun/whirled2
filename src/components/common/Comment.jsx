import axios from 'axios';
import moment from 'moment';
import { Link } from 'react-router-dom';
import { UserContext } from '../../Contexts';
import { ThreeDots } from 'react-bootstrap-icons';
import defaultPhoto from "../../media/profile_photo.png";
import DropDownMenu from '../common/tail-kit/elements/ddm/DropDownMenu'
import React, { useRef, useContext, useState, useEffect } from 'react';

export default function Comment ({owner, comment}) {
  const {user} = useContext(UserContext);
  const [isDdmOpen, setDdmOpen] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const ddm = useRef(null);

  useEffect(() => {
    window.addEventListener("click", unFocus, { passive: true });
    return () => {
      window.removeEventListener("click", unFocus);
    };
  });

  const unFocus = (e) => {
    if(ddm.current && ddm.current.contains(e.target)) {setDdmOpen(!isDdmOpen)}
    else {setDdmOpen(false)}
  };

  async function handleCommentDelete(id) {
    try {
      const res = await axios.delete(`${process.env.REACT_APP_AUTH_URL}/api/comment`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
        },
        data: {
          id
        }
      });
      if(res.status === 200) {
        setIsDeleted(true);
      }
    }
    catch (error) {
      console.error(error);
    }
  }

  function handleCommentReport(id) {
    console.log(id);
  }

  if(isDeleted) return <></>
  return (
    <div className={"flex mt-2 group hover:bg-gray-800 rounded-lg " + (isDdmOpen ? "bg-gray-800" : "")}>
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
          <div ref={ddm} className="flex-1 inline-flex justify-end" onClick={() => setDdmOpen(!isDdmOpen)}>
            <DropDownMenu className="text-xs" noFocus={true}
              items={(
                (user.username === comment.user.username) || (user.username === owner) 
                ?
                [
                  {icon: '', label: "Delete Comment", onClick: () => handleCommentDelete(comment._id)}, 
                  {icon: '', label: "Report Comment", onClick: () => handleCommentReport(comment._id)}, 
                ] 
                : 
                [
                  {icon: '', label: "Report Comment", onClick: () => handleCommentReport(comment._id)}, 
                ] 
                )} 
              icon={
              <div
                className={"p-2 text-xs text-white bg-green-500 hover:bg-green-600 cursor-pointer rounded-full group-hover:opacity-100 " + (isDdmOpen ? "opacity-100" : "opacity-0")}>
                <ThreeDots/>
              </div>
              }>
            </DropDownMenu>
          </div>
        </div>
        <span className="break-all text-gray-300 group-hover:text-gray-100">{comment.content}</span>
      </div>
    </div>
  )
}