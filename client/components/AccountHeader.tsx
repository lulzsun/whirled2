import { Menu, UnstyledButton, Avatar, Badge, Anchor, Button } from "@mantine/core";
import { IconStar, IconWallet, IconCoin, IconCash, IconMessageCircle, IconSettings, IconLogout } from "@tabler/icons-react";
import { useRecoilState, useRecoilValue } from "recoil";
import { pocketBaseState } from '../recoil/pocketBase.recoil';
import { pageVisibiltyState } from "../recoil/pageVisibility.recoil";

export default function AccountHeader() {
  const [_, setIsPageVisible] = useRecoilState(pageVisibiltyState);
  const {pb, user} = useRecoilValue(pocketBaseState);

  return (
    (user ?
      <Menu position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Avatar src={'/'} color="blue" radius="xl"/>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Anchor href={'/'}>
            <Menu.Item
              icon={<Avatar src={'/'} color="blue" radius="xl"/>}
            >
              <div className="flex flex-row space-x-4">
                <div>{'username'}</div>
                <div className="w-full"/>
                <div className="flex flex-row space-x-4 text-xs">
                  <IconStar size={16}/> 1
                </div>
              </div>
              <div className="text-xs text-gray-500">@{'username'}</div>
            </Menu.Item>
          </Anchor>
          <Menu.Divider/>
          <Menu.Item icon={<IconWallet size={14} />}>
            <div className="flex flex-row space-x-4">
              <span>Wallet</span>
              <div className="w-full"/>
              <div className="flex flex-row space-x-4 text-xs">
                <IconCoin size={16}/> 69k
                <IconCash size={16}/> 420
              </div>
            </div>
          </Menu.Item>
          <Anchor href={'/messages'}>
            <Menu.Item icon={<IconMessageCircle size={14} />}>
              <div className="flex flex-row space-x-4">
                <span>Messages</span>
                <div className="w-full"/>
                <div>
                  <Badge size="xs" color="red" variant="filled">10</Badge>
                </div>
              </div>
            </Menu.Item>
          </Anchor>
          <Menu.Item icon={<IconSettings size={14} />}>Settings</Menu.Item>
          <Menu.Divider />
          <Menu.Item icon={<IconLogout size={14}/>} onClick={() => {pb.authStore.clear();}}>Logout</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      :
      <>
        <Anchor href="/signup">
          <Button variant="gradient" gradient={{ from: 'orange', to: 'red' }} onClick={() => setIsPageVisible(true)}>Join Now!</Button>
        </Anchor>
        <Anchor href="/login">
          <Button variant="gradient" gradient={{ from: 'indigo', to: 'cyan' }} onClick={() => setIsPageVisible(true)}>Login</Button>
        </Anchor>
      </>
    )
  );
}