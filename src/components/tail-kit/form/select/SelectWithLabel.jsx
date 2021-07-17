import React from 'react';
import SelectOptions from './SelectOptions';
const SelectWithLabel = (props) => {
	return (
		<label className="text-gray-700 dark:text-gray-200" htmlFor={props.id}>
			{props.placeholder} 
			<select value={props.value} id={props.id} required={props.required} name={props.id}
			className="block py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
				<option value="">{props.placeholder}</option>
				<SelectOptions options={props.options}></SelectOptions>
			</select>
		</label>
	);
};
export default SelectWithLabel;
//# sourceMappingURL=SelectWithLabel.jsx.map