import React from 'react';
import Game from './Game';
import Page from './Page';
import { useRouteMatch } from 'react-router-dom';
import SplitPane from '../../common/splitpane';
 
export default function Main(props) {
  const isPageHidden = useRouteMatch("/").isExact;

  return (
    <div className="flex flex-grow" style={{position: "relative"}}>
      <SplitPane split="vertical" 
        resizerStyle={{ opacity: 0.3, width: `0px`, cursor: 'col-resize' }} 
        defaultSize={(isPageHidden ? 0 : 750)} minSize={(isPageHidden ? 0 : 750)} primary="second">
        <Game {...props}/>
        <Page {...props}/>
      </SplitPane>
    </div>
  );
}