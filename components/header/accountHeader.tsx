import { Menu, UnstyledButton, Avatar, Badge, Button } from "@mantine/core";
import { supabaseClient } from "@supabase/auth-helpers-nextjs";
import { IconMessageCircle, IconSettings, IconLogout, IconWallet, IconCoin, IconCash, IconStar } from "@tabler/icons";
import Link from "next/link";
import { useRecoilState } from "recoil";
import { userState } from "../../recoil/user.recoil";

export default function AccountHeader() {
  const [user] = useRecoilState(userState);

  return (
    (user ?
      <Menu position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Avatar src={user.avatar_url} color="blue" radius="xl"/>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
           <Link passHref href={{
              pathname: `/profile/[username]`,
              query: {
                username: user.username,
              },
            }}>
            <Menu.Item
              icon={
                <Avatar src={user.avatar_url} color="blue" radius="xl"/>
              }
              component="a"
            >
              <div className="flex flex-row space-x-4">
                <div>{user.username}</div>
                <div className="w-full"/>
                <div className="flex flex-row space-x-4 text-xs">
                  <IconStar size={16}/> 1
                </div>
              </div>
              <div className="text-xs text-gray-500">@{user.nickname}</div>
            </Menu.Item>
          </Link>
          <Menu.Divider />
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
          <Menu.Item icon={<IconMessageCircle size={14} />}>
            <div className="flex flex-row space-x-4">
              <span>Messages</span>
              <div className="w-full"/>
              <div>
                <Badge size="xs" color="red" variant="filled">10</Badge>
              </div>
            </div>
          </Menu.Item>
          <Menu.Item icon={<IconSettings size={14} />}>Settings</Menu.Item>
          <Menu.Divider />
          <Menu.Item icon={<IconLogout size={14}/>} onClick={() => supabaseClient.auth.signOut()}>Logout</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      :
      <>
        <Link href="/signup" passHref>
          <Button component="a" variant="gradient" gradient={{ from: 'orange', to: 'red' }}>Join Now!</Button>
        </Link>
        <Link href="/login" passHref>
          <Button variant="gradient" gradient={{ from: 'indigo', to: 'cyan' }}>Login</Button>
        </Link>
      </>
    )
  );
}