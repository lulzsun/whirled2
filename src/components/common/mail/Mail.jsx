import React, { useState, useRef, useEffect } from 'react';
import defaultPhoto from "../../../media/profile_photo.png";
const Mail = (props) => {
	const lists = [
		{
			img: '/images/person/6.jpg',
      label: 'Jean Marc',
			desc: 'Developer',
			info: 'Live in Paris with his father aaaaaaaaaaaaaaaaa aaaaaaa aaaaaaaaaa',
		},
		{
			img: '/images/person/10.jpg',
			desc: 'Charlie Moi',
			label: 'Designer',
			info: 'Love last ketchup song',
		},
		{
			img: '/images/person/3.jpg',
			desc: 'Marine Jeanne',
			label: 'CEO',
			info: 'Beer, beer, beer and beer',
		}
	];

  const [isOpen, setIsOpen] = useState(false);
  const button = useRef(null);

  useEffect(() => {
    window.addEventListener("click", unFocus, { passive: true });
    return () => {
      window.removeEventListener("click", unFocus);
    };
  });

  const unFocus = (e) => {
    if(button.current && button.current.contains(e.target)) {setIsOpen(!isOpen)}
    else {setIsOpen(false)}
  };    

	return (
    <div hidden={props.hidden} className={"relative text-left " + props.className}>
      <div className="w-full h-full">
        <button ref={button} type="button" onClick={() => setIsOpen(!isOpen)} 
          className={` ${props.withBackground ? 'border border-gray-300 bg-white dark:bg-gray-800 shadow-sm' : ''} 
            ${ (!props.noFocus && isOpen) ? 'flex items-center justify-center w-full h-full focus:bg-gray-700 focus:ring-offset-2 focus:text-white rounded-md' : 'flex items-center justify-center w-full h-full'}`} 
            id="options-menu">
          {props.label}

          {props.icon || (<svg width="20" height="20" fill="currentColor" viewBox="0 0 1792 1792" xmlns="http://www.w3.org/2000/svg">
            <path d="M1408 704q0 26-19 45l-448 448q-19 19-45 19t-45-19l-448-448q-19-19-19-45t19-45 45-19h896q26 0 45 19t19 45z"/>
          </svg>)}
        </button>
      </div>
      
      {isOpen && (
        <div className="absolute border border-gray-400 z-10 origin-top-right right-0 mt-2 w-96 container flex flex-col items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-4 py-2 sm:px-6 border-b w-full">
            <h3 className="text-sm leading-6 font-large text-gray-900 dark:text-white">Messages</h3>
          </div>
          <ul className="w-full flex flex-col divide divide-y">
            {lists.map((el) => {
              return (
                <li className="w-full flex flex-row" key={el.label}>
                  <div className="select-none cursor-pointer flex flex-1 items-center p-3">
                    <img alt="profileIcon" src={defaultPhoto} 
                      className="inline object-cover rounded-full h-10 w-10 mr-2"/>
                    <div className="w-full flex flex-col">
                      <div className="flex flex-row items-end">
                          <span className="mr-2 text-sm text-white font-semibold">{el.label}</span>
                          <span className="mr-2 text-sm border-r border-gray-600 h-4"></span>
                          <span className="mr-2 text-xs text-gray-400">@{el.desc}</span>
                          {/* <span className="mr-2 text-xs">{moment(comment.createdAt).fromNow()}</span> */}
                      </div>
                      <div className="text-gray-300 w-60 -mt-2 whitespace-nowrap overflow-ellipsis overflow-hidden">
                        <span className="text-xs">{el.info}</span>
                      </div>
                    </div>
                    {/* <div className="text-gray-600 dark:text-gray-200 text-xs">3 minutes ago</div> */}

                    {props.withAction && (<button className="w-24 text-right flex justify-end">
                    <svg width="20" fill="currentColor" height="20" className="hover:text-gray-800 dark:hover:text-white dark:text-gray-200 text-gray-500" viewBox="0 0 1792 1792" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1363 877l-742 742q-19 19-45 19t-45-19l-166-166q-19-19-19-45t19-45l531-531-531-531q-19-19-19-45t19-45l166-166q19-19 45-19t45 19l742 742q19 19 19 45t-19 45z"/>
                    </svg>
                  </button>)}
                  </div>
                </li>
              );
            })}
            <li className="flex flex-row">
              <div className="py-1 w-full">
                <h3 className="text-xs leading-6 text-center font-medium text-gray-900 dark:text-white">View All Messages</h3>
              </div>
            </li>
          </ul>
        </div>
      )}
	  </div>
	);
};
export default Mail;