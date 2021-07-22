//import React, { useCallback, useEffect, useRef, useState } from 'react';

/* 
  THIS IS A SUPER HACKY COMPONENT !!!! (but epic 😎👌)
  ---
  if editState === null
    > We save value with setValue
  if editState === false
    > We revert value back to previousValue
  if editState === true
    > We started editing the TextArea
*/
// export default function TextArea ({className, max, editState, setValue, value}) {
//   const valueRef = useRef();
//   const [previousValue, setPreviousValue] = useState(value);

//   //https://codepen.io/ramonsenadev/pen/jywRQg
//   const onKeyDown = useCallback((event) => {
//     const utils = {
//       special: {
//         '8': true,  //backspace
//         '16': true, //shift
//         '17': true, //ctrl
//         '18': true, //alt
//         '46': true  //delete
//       },
//       navigational: {
//         '37': true, //leftArrow
//         '38': true, //upArrow
//         '39': true, //rightArrow
//         '40': true  //downArrow
//       },
//       isSpecial(e) {
//         return typeof this.special[e.keyCode] !== 'undefined';
//       },
//       isNavigational(e) {
//         return typeof this.navigational[e.keyCode] !== 'undefined';
//       }
//     }

//     let len = event.target.innerText.length;
//     let hasSelection = false;
//     let selection = window.getSelection();
//     let isSpecial = utils.isSpecial(event);
//     let isNavigational = utils.isNavigational(event);

//     if (selection) hasSelection = !!selection.toString();
    
//     if (isSpecial || isNavigational) return true;
    
//     if (len >= event.target.dataset.max && !hasSelection) {
//       event.preventDefault();
//       return false;
//     }
//   }, []);

//   const onKeyUp = useCallback((event) => {
//     if ((valueRef.current === event.target)) setValue(event.target.innerText);
//   }, [setValue])

//   useEffect(() => {
//     if(editState === null) {
//       // IF IT IS NULL, WE ARE UPDATING/SAVING
//       setPreviousValue(valueRef.current.innerText);
//     } else if(editState === false) {
//       // IF IT IS FALSE, WE ARE UNDOING
//       setValue(previousValue); // this rerenders three times, possible performance issue?
//       valueRef.current.innerText = value;
//     }
//     valueRef.current.innerText = value;
//   }, [onKeyDown, previousValue, setPreviousValue, value, setValue, editState])

//   return (
//     <div className={className} ref={valueRef} //suppressContentEditableWarning={true} 
//       contentEditable={editState} data-max={max} 
//       onKeyDown={(e) => onKeyDown(e)} onKeyUp={(e) => onKeyUp(e)}>
//     </div>
//   );
// }

export const handleContentEditableMax = (event) => {
  const utils = {
    special: {
      '8': true,  //backspace
      '16': true, //shift
      '17': true, //ctrl
      '18': true, //alt
      '46': true  //delete
    },
    navigational: {
      '37': true, //leftArrow
      '38': true, //upArrow
      '39': true, //rightArrow
      '40': true  //downArrow
    },
    isSpecial(e) {
      return typeof this.special[e.keyCode] !== 'undefined';
    },
    isNavigational(e) {
      return typeof this.navigational[e.keyCode] !== 'undefined';
    }
  }

  let len = event.target.innerText.length;
  let hasSelection = false;
  let selection = window.getSelection();
  let isSpecial = utils.isSpecial(event);
  let isNavigational = utils.isNavigational(event);

  if (selection) hasSelection = !!selection.toString();
  
  if (isSpecial || isNavigational) return true;
  
  if (len >= event.target.dataset.max && !hasSelection) {
    event.preventDefault();
    return false;
  }
};