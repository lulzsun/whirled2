import React, { useRef } from 'react';
import Game from './Game';
import Page from './Page';
import { useRouteMatch } from 'react-router-dom';
 
export default function Main(props) {
  const hidden = useRouteMatch("/").isExact;
  const game = useRef();
  const resizer = useRef();
  const page = useRef();

  // https://htmldom.dev/create-resizable-split-views/
  var gameWidth = 0;
  var x = 0;

  const handleMouseDown = function(event) {
    x = event.clientX;
    gameWidth = game.current.getBoundingClientRect().width;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = function(e) {
    const dx = e.clientX - x;

    const newGameWidth = (gameWidth + dx) * 100 / resizer.current.parentNode.getBoundingClientRect().width;
    game.current.style.width = `${newGameWidth}%`;

    document.body.style.cursor = 'col-resize';
    game.current.style.userSelect = 'none';
    game.current.style.pointerEvents = 'none';
    page.current.style.userSelect = 'none';
    page.current.style.pointerEvents = 'none';
  };

  const handleMouseUp = function() {
    document.body.style.removeProperty('cursor');
    game.current.style.removeProperty('user-select');
    game.current.style.removeProperty('pointer-events');
    page.current.style.removeProperty('user-select');
    page.current.style.removeProperty('pointer-events');

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div className="flex flex-grow" style={{position: "relative"}}>
      <div ref={game} style={(hidden === true ? {'width': '100%'} : {'width' : '50%'})}>
        <Game {...props}/>
      </div>

      <div ref={resizer} hidden={hidden} className="w-1" onMouseDown={handleMouseDown} style={{'cursor': 'col-resize'}}></div>

      <div ref={page} hidden={hidden} className="flex-1">
        <Page {...props}/>
      </div>
    </div>
  )
}