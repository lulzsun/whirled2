import React, {useEffect} from 'react';
//import { v4 as uuidv4 } from 'uuid';
import { Header, SplitView } from './components/common';
import { BrowserRouter as Router, useRouteMatch } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div class="flex flex-col h-screen">
        <Header />
        <div class="flex flex-grow" style={{position: "relative"}}>
          <SplitView />
        </div>
      </div>
    </Router>
  );
}

export default App;
