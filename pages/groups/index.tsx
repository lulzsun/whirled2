import { useEffect } from "react";
import { useRecoilState } from "recoil";
import { pageVisibiltyState } from "../../recoil/pageVisibility.recoil";

export default function Groups() {
  const [isPageVisible, setIsPageVisible] = useRecoilState(pageVisibiltyState);

  useEffect(() => {
    setIsPageVisible(true);
  }, []);

  return (
    <div className="border border-gray-900 dark:border-white shadow-lg rounded-3xl p-4 m-4">
      hi from groups
    </div>
  );
}