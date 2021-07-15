import React from 'react';
import SplitPane from '../splitpane'
import { Game, Page } from '../common';
import { useRouteMatch } from 'react-router-dom';

function SplitView () {
  const hidden = useRouteMatch("/").isExact;
  const style = { opacity: 0.3, width: '5px', cursor: 'col-resize' };

  if(hidden) {
    style.width = '0px';
    return (
      <SplitPane split="vertical" resizerStyle={style} defaultSize={0} size={0} primary="second">
        <Game />
        <Page />
      </SplitPane>
    )
  }

  return (
    <SplitPane split="vertical" resizerStyle={style} defaultSize={750} minSize={750} primary="second">
      <Game />
      <Page />
    </SplitPane>
  )
}

export default SplitView;