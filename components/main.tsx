import { AllotmentProps } from "allotment";
import { PaneProps } from "allotment/dist/types/src/allotment";
import { useRef, useState, ComponentType, useEffect } from "react";
import { useRecoilState } from "recoil";
import { pageVisibilty } from "../recoil/pageVisibility.recoil";
import Game from "./game";
import Header from "./header";

type Props = {
  children: JSX.Element,
};

export default function Main({children} : Props) {
  const [isPageVisible] = useRecoilState(pageVisibilty);

  // https://github.com/johnwalley/allotment/issues/81
  // all this below can be wrapped into useAllotment hook or smth like that
  const isMountedRef = useRef(false);
  const [Allotment, setAllotment] = useState<
    (ComponentType<AllotmentProps> & { Pane: ComponentType<PaneProps> }) | null
  >(null);

  useEffect(() => {
    isMountedRef.current = true;
    import("allotment").then((mod) => {
      if (!isMountedRef.current) {
        return;
      }
      setAllotment(mod.Allotment);
    }).catch((err) =>
      console.error(err, `could not import allotment ${err.message}`)
    );
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (!Allotment) {
    return <div>loading...</div>;
  }
  // end of hook
  
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