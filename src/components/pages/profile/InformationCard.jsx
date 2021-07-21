import React, { useRef } from 'react';
import axios from 'axios';
import { Pencil, Save, XLg } from 'react-bootstrap-icons';
// import { Link } from 'react-router-dom';

export default function InformationCard ({owner, info, showMore, editInfo, setEditInfo, setInfo, setShowMore}) {
  const infoRef = {
    aboutMe: useRef(),
    activities: useRef(),
    interests: useRef(),
    favoriteBooks: useRef(),
    favoriteGames: useRef(),
    favoriteMovies: useRef(),
    favoriteMusic: useRef(),
    favoriteShows: useRef()
  }

  function handleEditButton() {
    setEditInfo(!editInfo);
    updateInfo();
  }

  function updateInfo() {
    infoRef.aboutMe.current.innerText = info.aboutMe;
    infoRef.activities.current.innerText = info.activities;
    infoRef.interests.current.innerText = info.interests;
    infoRef.favoriteBooks.current.innerText = info.favoriteBooks;
    infoRef.favoriteGames.current.innerText = info.favoriteGames;
    infoRef.favoriteMovies.current.innerText = info.favoriteMovies;
    infoRef.favoriteMusic.current.innerText = info.favoriteMusic;
    infoRef.favoriteShows.current.innerText = info.favoriteShows;
  }

  async function handleSaveButton() {
    try {
      const infoJson = {
        information: {
          aboutMe: infoRef.aboutMe.current.innerText,
          activities: infoRef.activities.current.innerText,
          interests: infoRef.interests.current.innerText,
          favoriteBooks: infoRef.favoriteBooks.current.innerText,
          favoriteGames: infoRef.favoriteGames.current.innerText,
          favoriteMovies: infoRef.favoriteMovies.current.innerText,
          favoriteMusic: infoRef.favoriteMusic.current.innerText,
          favoriteShows: infoRef.favoriteShows.current.innerText,
        }
      }
      const res = await axios.post(`${process.env.REACT_APP_API_URL}/api/edit/profile`, JSON.stringify(infoJson), {
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('accessToken'),
          'Content-Type': 'application/json'
        }
      });
      if(res.data) {
        console.log(res);
      }
      setInfo(infoJson.information);
      setEditInfo(false);
    } catch (error) {
      if(error !== undefined)
      console.error(error);
    }
  }

  if(info === null) return (<></>);
  return (
    <div className="max-w-5xl w-full mx-auto z-10">
      <div className="flex flex-col">
        <div className="bg-gray-900 border border-white-900 shadow-lg rounded-3xl p-4 m-4">
          <div className="relative flex-none sm:flex">
            {/* Heading */}
            <div className="absolute flex flex-row w-full transform -translate-y-full">
              <div className="flex-1 inline-flex items-center">
                <div className="p-2.5 pl-4 pr-4 text-white leading-none bg-green-500 rounded-full">
                Information
                </div>
              </div>
              <div className="flex-1 inline-flex justify-end">
                {(editInfo 
                ? <div className="pl-2 pr-2 p-1 m-2 text-xs text-white leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full"
                    onClick={() => handleSaveButton()}>
                    <Save/>
                  </div>
                : <></>
                )}
                <div 
                  className=
                  {
                    "pl-2 pr-2 p-1 m-2 text-xs text-white leading-none cursor-pointer rounded-full " +
                    (editInfo ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600')
                  }
                  hidden={(owner === localStorage.getItem('username') ? false : true)}
                  onClick={() => handleEditButton()}>
                  {(editInfo ? <XLg/> : <Pencil/>)}
                </div>
              </div>
            </div>
            {/* Content (could be modular, but i dont care*/}
            <div className={'text-gray-100 mb-2 overflow-hidden w-full ' + (showMore | editInfo ? 'h-full' : 'h-20')}>
              <div className="text-xs">
                <div className="pt-3 flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">About Me</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.aboutMe}>{info.aboutMe}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Activities</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.activities}>{info.activities}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Interests</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.interests}>{info.interests}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Games</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.favoriteGames}>{info.favoriteGames}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Music</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.favoriteMusic}>{info.favoriteMusic}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Movies</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.favoriteMovies}>{info.favoriteMovies}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Shows</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.favoriteShows}>{info.favoriteShows}</div>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Books</div>
                  <div className={"px-4 py-1 w-full " + (editInfo ? 'border border-white bg-gray-700' : '')}
                   suppressContentEditableWarning={true}
                   contentEditable={editInfo} ref={infoRef.favoriteBooks}>{info.favoriteBooks}</div>
                </div>
              </div>
            </div>
            {/*  Footer */}
            <div className="absolute flex flex-row w-full top-full">
              <div className="flex-1 inline-flex justify-center">
                <div hidden={editInfo} className="p-1 pl-2 pr-2 m-1.5 text-xs text-text-white-200 leading-none bg-green-500 hover:bg-green-600 cursor-pointer rounded-full"
                  onClick={() => setShowMore(!showMore)}>
                  Show {(showMore ? 'less' : 'more')} information
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}