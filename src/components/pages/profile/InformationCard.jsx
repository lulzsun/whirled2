import React, { useState } from 'react';
import axios from 'axios';
import { Pencil, Save, XLg } from 'react-bootstrap-icons';
import TextArea from '../../common/TextArea';

export default function InformationCard ({owner, info, showMore, editInfo, setEditInfo, setInfo, setShowMore}) {
  const [aboutMe, setAboutMe] = useState(info.aboutMe);
  const [activities, setActivities] = useState(info.activities);
  const [interests, setInterests] = useState(info.interests);
  const [favoriteBooks, setFavoriteBooks] = useState(info.favoriteBooks);
  const [favoriteGames, setFavoriteGames] = useState(info.favoriteGames);
  const [favoriteMovies, setFavoriteMovies] = useState(info.favoriteMovies);
  const [favoriteMusic, setFavoriteMusic] = useState(info.favoriteMusic);
  const [favoriteShows, setFavoriteShows] = useState(info.favoriteShows);

  function handleEditButton() {
    setEditInfo(!editInfo);
  }

  async function handleSaveButton() {
    setEditInfo(null);
    try {
      const infoJson = {
        information: {
          aboutMe,
          activities,
          interests,
          favoriteBooks,
          favoriteGames,
          favoriteMovies,
          favoriteMusic,
          favoriteShows,
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
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setAboutMe} value={aboutMe}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Activities</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setActivities} value={activities}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Interests</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setInterests} value={interests}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Games</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setFavoriteGames} value={favoriteGames}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Music</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setFavoriteMusic} value={favoriteMusic}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Movies</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setFavoriteMovies} value={favoriteMovies}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Shows</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setFavoriteShows} value={favoriteShows}></TextArea>
                </div>
                <div className="flex">
                  <div className="flex-shrink-0 w-32 px-4 py-1 font-bold">Favorite Books</div>
                  <TextArea className={"px-4 py-1 w-full break-all " + (editInfo ? 'border border-white bg-gray-700' : '')}
                    max={200} editState={editInfo} setValue={setFavoriteBooks} value={favoriteBooks}>{info.favoriteBooks}</TextArea>
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