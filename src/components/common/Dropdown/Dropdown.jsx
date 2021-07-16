import React, { useState } from 'react';
import DropdownItemList from './DropdownItemList';

export default function Dropdown ({id, items=[], required, onChange, value="", placeholder=""}) {
    const [openList, setOpenList] = useState(false);
    const [hidden, setHidden] = useState(true);

    const handleOpenItemList = (e) => {
        setOpenList(e.target.checked);
        setHidden(!e.target.checked);
    }

    const handleOnBlur = () => {
        setTimeout(() => {
            if(openList === true) {
                setOpenList(false);
                setHidden(true);
            }
        }, 100);
    };

    return (
        <div className="relative">
            <input type="checkbox" id={id+'list'} className="w-0 opacity-0 absolute" checked={openList} onChange={handleOpenItemList} onBlur={handleOnBlur}></input>
            <label htmlFor={id+'list'} className="flex items-center space-x-1 cursor-pointer pr-1">
                <input className="rounded w-full py-2 px-3 text-black" required={required} placeholder={placeholder} value={value} onChange={onChange}></input>
                <svg className="h-4 w-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </label>

            <div hidden={hidden} className="absolute right-8 rounded border border-black h-20 overflow-y-auto" style={{scrollbarWidth: 'thin'}}>
                <DropdownItemList id={id} items={items} value={value} onChange={onChange}/>
            </div>
        </div>
    )
}