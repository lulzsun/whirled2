import React from 'react';
import Game from './Game';
import Page from './Page';
import { useRouteMatch } from 'react-router-dom';
import SplitPane from '../../common/splitpane';
 
export default function Main(props) {
  const hidden = useRouteMatch("/").isExact;

	if(hidden) {
		return (
      <div className="flex flex-grow" style={{position: "relative"}}>
        <Game {...props}/>
      </div>
		)
	}

	return (
    <div className="flex flex-grow" style={{position: "relative"}}>
      <SplitPane split="vertical" resizerStyle={{ opacity: 0.3, width: '5px', cursor: 'col-resize' }} defaultSize={1200} minSize={100} maxSize={1200} primary="first">
        <Game {...props}/>
        <Page {...props}/>
      </SplitPane>
    </div>
	)
}