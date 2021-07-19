import React from 'react';
import Game from './Game';
import Page from './Page';
import { useRouteMatch } from 'react-router-dom';
import SplitPane from '../../common/splitpane';
 
export default function Main(props) {
  const hidden = useRouteMatch("/").isExact;
	const resizerStyle = { opacity: 0.3, width: '5px', cursor: 'col-resize' };

	if(hidden) {
		resizerStyle.width = '0px';
		return (
      <div className="flex flex-grow" style={{position: "relative"}}>
        <SplitPane split="vertical" resizerStyle={resizerStyle} defaultSize={0} minSize={0} primary="second">
          <Game {...props}/>
          <Page {...props}/>
        </SplitPane>
      </div>
		)
	}

	return (
    <div className="flex flex-grow" style={{position: "relative"}}>
      <SplitPane split="vertical" resizerStyle={resizerStyle} defaultSize={750} minSize={750} primary="second">
        <Game {...props}/>
        <Page {...props}/>
      </SplitPane>
    </div>
	)
}