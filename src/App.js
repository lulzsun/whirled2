import React from 'react';
//import { v4 as uuidv4 } from 'uuid';
import { Header, SplitView } from './components/common';
import { BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="flex flex-col h-screen">
        <Header />
        <div className="flex flex-grow" style={{position: "relative"}}>
			<SplitView />
        </div>
      </div>
    </Router>
  );
}

export default App;