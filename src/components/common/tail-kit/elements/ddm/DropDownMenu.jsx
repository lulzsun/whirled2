import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const DropDownMenu = (props) => {
    //https://stackoverflow.com/a/62681847/8805016
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
        <div>
            <button ref={button} type="button" onClick={() => setIsOpen(!isOpen)} 
                className={` ${props.withBackground ? 'border border-gray-300 bg-white dark:bg-gray-800 shadow-sm' : ''} 
                    ${ !props.noFocus ? 'flex items-center justify-center w-full rounded-md  px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-50 hover:bg-gray-50 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-gray-500' : 'flex items-center justify-center w-full h-full'}`} 
                    id="options-menu">
                {props.label}

                {props.icon || (<svg width="20" height="20" fill="currentColor" viewBox="0 0 1792 1792" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1408 704q0 26-19 45l-448 448q-19 19-45 19t-45-19l-448-448q-19-19-19-45t19-45 45-19h896q26 0 45 19t19 45z"/>
                </svg>)}
            </button>
        </div>

        {(props.forceOpen || isOpen) && (<div className="absolute z-10 origin-top-right right-0 mt-2 w-36 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5">
                <div className={`py-1 ${props.withDivider ? 'divide-y divide-gray-100' : ''}`} role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                    {props.items.map((item) => {
                        return (<Link key={item.label} to={item.link || '#'} onClick={item.onClick} className={`${item.icon ? 'flex items-center' : 'block'} block px-4 py-2 text-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-100 dark:hover:text-white dark:hover:bg-gray-600`} role="menuitem">
                                    {item.icon}

                                    <span className="flex flex-col">
                                        <span>{item.label}</span>
                                        {item.desc && <span className="text-gray-400 text-xs">{item.desc}</span>}
                                    </span>
                                </Link>);
                    })}
                </div>
            </div>)}
    </div>
        );
};
export default DropDownMenu;
//# sourceMappingURL=DropDownMenu.jsx.map