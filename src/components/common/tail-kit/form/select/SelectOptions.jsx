import React from 'react';
const SelectOptions = (props) => {
  return (
    props.options.map(option => {
      return <option key={option} value={option}>{option}</option>
    })
  )
};
export default SelectOptions;
//# sourceMappingURL=SelectWithLabel.jsx.map