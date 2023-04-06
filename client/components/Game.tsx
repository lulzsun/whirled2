import { Center } from "@mantine/core";

export default function Game() {
  return (
    <div className="h-full w-full bg-black">
			<div className="h-full flex flex-col items-center">
				<div className="flex-initial">
					<b>top</b>
				</div>
				<div className="flex-auto overflow-hidden w-full">
          <Center className="flex flex-col w-full h-full" mx="auto">
            <span className="text-5xl">🔧🐒</span>
          </Center>
				</div>
				<div className="flex-initial">
					<b>bottom</b>
				</div>
			</div>
		</div>
  );
}