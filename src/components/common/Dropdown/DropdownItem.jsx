import React from 'react';

export default function DropdownItem ({id, item, onChange, value}) {
	function handleOnChange(e) {
		value=e.target.value;
		onChange(e);
	}

	return (
		<label className="flex items-center text-black cursor-pointer text-right pl-4 pr-5 h-10 block bg-white hover:bg-gray-300">{item}
			<input className="opacity-5 w-0 h-0" type="radio" id={id + "-" + item} name={id} value={item} onClick={(e) => handleOnChange(e)}></input>
		</label>
	)
}