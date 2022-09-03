import { Avatar, Badge, Button, Group, Menu, Tabs, UnstyledButton } from "@mantine/core";
import { IconBasket, IconArmchair2, IconBrandAppleArcade, 
  IconDoor, IconUser, IconWorld, IconLogout, IconSettings, IconMessageCircle } from "@tabler/icons";
import { supabaseClient } from '@supabase/auth-helpers-nextjs';
import Link from "next/link";
import { userState } from "../recoil/user.recoil";
import { useRecoilState } from "recoil";

export default function Header() {
  const [user] = useRecoilState(userState);
  
  return (
    <div className="flex-initial">
      <Group position="apart" className="border-b border-gray-700">
        <div className="pl-2">
          Whirled 2.0
        </div>
        <div className="flex flex-row space-x-4 pr-2">
          <Tabs className="self-end">
            <Tabs.List position="right">
              <Tabs.Tab value="me" icon={<IconUser size={15}/>}>
                <Link href={"/profile"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Me</a>
                </Link>
                <span className="text-transparent">Me</span>
              </Tabs.Tab>

              <Tabs.Tab value="stuff" icon={<IconArmchair2 size={15}/>}>
                <Link href={"/stuff"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Stuff</a>
                </Link>
                <span className="text-transparent">Stuff</span>
              </Tabs.Tab>

              <Tabs.Tab value="games" icon={<IconBrandAppleArcade size={15}/>}>
                <Link href={"/games"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Games</a>
                </Link>
                <span className="text-transparent">Games</span>
              </Tabs.Tab>
              
              <Tabs.Tab value="rooms" icon={<IconDoor size={15}/>}>
                <Link href={"/rooms"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Rooms</a>
                </Link>
                <span className="text-transparent">Rooms</span>
              </Tabs.Tab>

              <Tabs.Tab value="groups" icon={<IconWorld size={15}/>}>
                <Link href={"/groups"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Groups</a>
                </Link>
                <span className="text-transparent">Groups</span>
              </Tabs.Tab>

              <Tabs.Tab value="shop" icon={<IconBasket size={15}/>}>
                <Link href={"/shop"}>
                  <a className="absolute inset-0 w-full h-full flex items-center" style={{textIndent: '32px'}}>Shop</a>
                </Link>
                <span className="text-transparent">Shop</span>
              </Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <Group className="p-1" position="center">
          {(user ?
            <Menu position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Avatar color="blue" radius="xl">
                    <IconUser size={24} />
                  </Avatar>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  icon={
                    <Avatar color="blue" radius="xl">
                      <IconUser size={24} />
                    </Avatar>
                  }
                  component="a"
                  href="https://mantine.dev"
                  target="_blank"
                >
                  <div>{user.username}</div>
                  <div>@{user.nickname}</div>
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item icon={<IconMessageCircle size={14} />}>Messages<Badge color="red" variant="filled">10</Badge></Menu.Item>
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
          )}
          </Group>
        </div>
      </Group>
    </div>
  );
}