import { Allotment } from "allotment";
import { useRecoilState } from "recoil";
import { pageVisibilty } from "../recoil/pageVisibility.recoil";
import Game from "./game";
import Header from "./header";

type Props = {
  children: JSX.Element,
};

export default function Main({children} : Props) {
  const [isPageVisible] = useRecoilState(pageVisibilty);
  
  return (
    <div className='flex flex-col h-screen'>
      <Header/>
      <div className='w-full h-full'>
        <Allotment>
          <Allotment.Pane minSize={0}>
            <Game/>
          </Allotment.Pane>
          <Allotment.Pane minSize={500} visible={isPageVisible}>
            <div className='w-full h-full overflow-y-auto'>
              {children}
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </div>
  );
}