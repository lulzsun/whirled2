import React, { useEffect } from 'react';
import axios from 'axios';
import PagerButton from 'src/components/tail-kit/elements/buttons/PagerButton';

export default function Avatars () {
	// https://stackoverflow.com/a/57847874/8805016
	// effectively, this only gets called once and then renders
	useEffect(() => {
    async function getInventoryData() {
			try {
				const res = await axios.get(`${process.env.REACT_APP_API_URL}/api/stuff`, {
					headers: {
						'Authorization': 'Bearer ' + localStorage.getItem('accessToken')
					}
				});
				if(res.data) {
					console.log(res);
				}
			} catch (error) {
				if(error !== undefined)
				console.error(error);
			}
		}

		getInventoryData();
  }, []);
  
	return (
    <div className="h-full flex flex-col items-center">
      <div className="pt-20 flex-initial">
        <b>AVATARS</b>
      </div>
      <div className="w-full flex-auto overflow-y-auto">
        <div className="h-full flex items-center justify-center">
          <div className="grid grid-flow-row grid-row-3 grid-cols-4 gap-10">
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p> 
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p> 
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p> 
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
            <p className="text-center text-5xl select-none cursor-pointer">🐒</p>
          </div>
        </div>
      </div>
      <div className="flex-initial">
        <div className="pb-20"><PagerButton></PagerButton></div>
      </div>
    </div>
	)
}