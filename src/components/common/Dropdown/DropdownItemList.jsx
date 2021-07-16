import React from 'react';
import DropdownItem from './DropdownItem';

export default function DropdownItemList ({id, items, onChange, value}) {
  return (
    items.map(item => {
        return <DropdownItem id={id} key={item} value={value} item={item} onChange={onChange}/>
    })
  )
}